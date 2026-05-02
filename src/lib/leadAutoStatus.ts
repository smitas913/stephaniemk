import { supabase } from "@/integrations/supabase/client";

/**
 * Booking-lead status auto-progression.
 *
 * Pipeline order (forward-only):
 *   New → Contacted → Engaged → Booked
 *
 * "Not Interested" is a terminal manual choice and is never set or overridden
 * automatically. Auto-progression only moves a lead forward in the pipeline;
 * it never downgrades. Manual user changes via the status dropdown remain
 * authoritative and can override anything.
 */
export type LeadStatus = "New" | "Contacted" | "Engaged" | "Booked" | "Not Interested";

const RANK: Record<string, number> = {
  New: 0,
  Contacted: 1,
  Engaged: 2,
  Booked: 3,
};

/** Returns true if `next` represents forward movement vs `current`. */
export function isForwardLeadStatus(current: string | null | undefined, next: LeadStatus): boolean {
  if (!current) return true;
  if (current === "Not Interested") return false; // never auto-revive
  const cur = RANK[current];
  const nxt = RANK[next];
  if (cur === undefined || nxt === undefined) return false;
  return nxt > cur;
}

/**
 * Map an activity action (Call/Text/Email/etc) and intent category to the
 * status it would progress a lead into. Returns null when the activity does
 * not imply any status change.
 */
export function deriveLeadStatusFromActivity(params: {
  actionType?: string | null;
  category?: string | null;
  isBookingAttempt?: boolean | null;
}): LeadStatus | null {
  const { actionType, category, isBookingAttempt } = params;

  // Booking confirmed via category/booking flag → Booked
  if (category === "Booking" && isBookingAttempt) {
    // Booking attempt alone is not enough — Booked is reserved for actual scheduling.
    // Keep at "Engaged" for booking conversations that didn't land yet.
    return "Engaged";
  }

  // Two-way conversation indicators → Engaged
  if (
    actionType === "In Person" ||
    actionType === "Conversation" ||
    actionType === "Responded"
  ) {
    return "Engaged";
  }

  // One-way outreach attempts → Contacted (Attempting Contact)
  if (
    actionType === "Call" ||
    actionType === "Text" ||
    actionType === "Email" ||
    actionType === "Did Not Connect" ||
    actionType === "Left Message"
  ) {
    return "Contacted";
  }

  return null;
}

/**
 * Apply forward-only auto-progression to a single booking lead. No-op if the
 * lead is already at or past the target stage, or if the lead is "Not Interested".
 */
export async function autoProgressLead(leadId: string, target: LeadStatus): Promise<void> {
  const { data, error } = await supabase
    .from("booking_leads" as any)
    .select("status")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !data) return;
  const current = (data as any).status as string | null;
  if (!isForwardLeadStatus(current, target)) return;
  await supabase
    .from("booking_leads" as any)
    .update({ status: target } as any)
    .eq("id", leadId);
}

/**
 * When a Lead-tagged note is logged, advance the lead's pipeline stage based
 * on the action type & intent category. Best-effort; failures are silent so
 * they never block the primary note save.
 */
export async function autoProgressLeadFromNote(params: {
  leadId: string;
  actionType?: string | null;
  category?: string | null;
  isBookingAttempt?: boolean | null;
  noteType?: string | null;
}): Promise<void> {
  // Skip dismissal-style notes — they don't represent real outreach.
  if (params.noteType === "Skipped" || params.noteType === "No Follow-Up Needed") return;
  const target = deriveLeadStatusFromActivity(params);
  if (!target) return;
  try {
    await autoProgressLead(params.leadId, target);
  } catch {
    /* swallow */
  }
}

/**
 * When an event is created and the hostess matches a known booking lead by
 * name (case-insensitive), promote that lead to "Booked".
 */
export async function autoProgressLeadFromEvent(params: {
  hostessName?: string | null;
}): Promise<void> {
  const name = params.hostessName?.trim();
  if (!name) return;
  try {
    const { data } = await supabase
      .from("booking_leads" as any)
      .select("id, status")
      .ilike("name", name);
    const matches = (data as any[]) || [];
    for (const lead of matches) {
      if (isForwardLeadStatus(lead.status, "Booked")) {
        await supabase
          .from("booking_leads" as any)
          .update({ status: "Booked" } as any)
          .eq("id", lead.id);
      }
    }
  } catch {
    /* swallow */
  }
}
