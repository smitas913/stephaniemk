import { supabase } from "@/integrations/supabase/client";
import { createNote } from "@/lib/queries";
import { addDays, format } from "date-fns";
import { toLocalDateKey } from "@/lib/dateOnly";

export const CATALOG_NOTE_TYPE = "Catalog Sent";
export const CATALOG_FOLLOW_UP_OFFSET_DAYS = 6;

export const CATALOG_CYCLES = ["Spring", "Summer", "Fall", "Winter", "Holiday"] as const;
export type CatalogCycle = typeof CATALOG_CYCLES[number];

/** Derive "Q1"–"Q4" from a YYYY-MM-DD string. */
export function quarterFromDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = parseInt(dateStr.slice(5, 7), 10);
  if (!m) return null;
  return `Q${Math.ceil(m / 3)}`;
}

interface LogCatalogSentOpts {
  customerId: string;
  campaignType: string; // Spring / Summer / etc.
  mailingDate: string; // YYYY-MM-DD
  campaignId?: string | null;
  /** If true, also push customer.next_follow_up_date forward to mailingDate+6 (only if sooner). */
  scheduleFollowUp?: boolean;
}

/**
 * Logs a "Catalog Sent" note and (optionally) schedules a +6 day follow-up.
 * The trigger on notes will auto-update customer.last_contacted.
 */
export async function logCatalogSent(opts: LogCatalogSentOpts) {
  const { customerId, campaignType, mailingDate, campaignId, scheduleFollowUp = true } = opts;
  const followUpDate = format(addDays(new Date(mailingDate + "T00:00:00"), CATALOG_FOLLOW_UP_OFFSET_DAYS), "yyyy-MM-dd");
  const cycleQ = quarterFromDate(mailingDate);

  await createNote({
    entity_type: "Customer",
    customer_id: customerId,
    person_type: "customer",
    person_id: customerId,
    note_type: CATALOG_NOTE_TYPE,
    note_body: `${campaignType} catalog mailed${cycleQ ? ` (${cycleQ})` : ""}`,
    note_date: mailingDate,
    next_follow_up_date: scheduleFollowUp ? followUpDate : null,
    is_follow_up: false,
    is_booking_attempt: false,
    tags: ["catalog", campaignType, cycleQ, campaignId ? `campaign:${campaignId}` : ""].filter(Boolean) as string[],
  });

  if (scheduleFollowUp) {
    // Only push next_follow_up forward if the existing one is later or missing.
    const { data: existing } = await supabase
      .from("customers")
      .select("next_follow_up_date")
      .eq("id", customerId)
      .maybeSingle();
    const current = (existing as any)?.next_follow_up_date as string | null;
    if (!current || current > followUpDate) {
      await supabase
        .from("customers")
        .update({
          next_follow_up_date: followUpDate,
          follow_up_reason: `${campaignType} Catalog Follow-Up`,
        } as any)
        .eq("id", customerId);
    }
  }

  return { followUpDate, cycle: cycleQ };
}

interface CatalogNoteLike {
  note_type?: string | null;
  note_date?: string | null;
  tags?: string[] | null;
  note_body?: string | null;
}

/** Inspect a list of notes (most recent first or any order) and return latest catalog metadata. */
export function getLastCatalogInfo(notes: CatalogNoteLike[] | undefined | null): {
  lastDate: string | null;
  cycle: string | null;
  campaignType: string | null;
} {
  if (!notes || notes.length === 0) return { lastDate: null, cycle: null, campaignType: null };
  const catalogNotes = notes.filter((n) => n.note_type === CATALOG_NOTE_TYPE && n.note_date);
  if (catalogNotes.length === 0) return { lastDate: null, cycle: null, campaignType: null };
  catalogNotes.sort((a, b) => (b.note_date! > a.note_date! ? 1 : -1));
  const latest = catalogNotes[0];
  const tags = Array.isArray(latest.tags) ? latest.tags : [];
  const campaignType = tags.find((t) => (CATALOG_CYCLES as readonly string[]).includes(t)) || null;
  return {
    lastDate: latest.note_date || null,
    cycle: quarterFromDate(latest.note_date),
    campaignType,
  };
}

/** Convenience: today as YYYY-MM-DD. */
export function todayKey(): string {
  return toLocalDateKey(new Date());
}
