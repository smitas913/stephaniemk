import { toLocalDateKey } from "@/lib/dateOnly";
import type { FocusDetailItem, FocusRawData } from "@/components/TodaysFocus";

const CUSTOMER_DAILY_ACTIVITY_TYPES = new Set(["Call", "Text", "Email", "In Person", "Delivery", "Reorder Conversation", "Did Not Connect"]);

function getTimestampDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateKey(parsed);
}

/** Returns true only if the item resolved to a real person/record */
function isResolved(item: FocusDetailItem): boolean {
  return !!item.name && item.name !== "Unknown" && item.name !== "Customer" && item.name !== "Prospect" && item.name !== "Consultant";
}

function resolveNoteIdentity(
  n: any,
  customers: any[],
  prospects: any[],
  bookingLeads: any[],
  consultants: any[],
  events: any[],
): { id: string; name: string; type: string } | null {
  if (n.entity_type === "Customer" && (n.person_id || n.customer_id)) {
    const resolvedId = n.person_id || n.customer_id;
    const c = customers.find((c: any) => c.id === resolvedId);
    if (!c) return null;
    return { id: resolvedId, name: c.full_name, type: "Customer" };
  }
  if (n.entity_type === "Prospect" && (n.person_id || n.prospect_id)) {
    const resolvedId = n.person_id || n.prospect_id;
    const p = prospects.find((p: any) => p.id === resolvedId);
    if (!p) return null;
    return { id: resolvedId, name: p.name, type: "Prospect" };
  }
  if (n.entity_type === "Lead") {
    const resolvedId = n.person_id;
    const matchedLead = resolvedId
      ? bookingLeads.find((l: any) => l.id === resolvedId)
      : bookingLeads.find((l: any) => n.note_body?.includes(l.name));
    if (!matchedLead) return null;
    return { id: matchedLead.id, name: matchedLead.name, type: "Lead" };
  }
  if (n.entity_type === "Consultant") {
    const resolvedId = n.person_id;
    const matchedConsultant = resolvedId
      ? consultants.find((c: any) => c.id === resolvedId)
      : consultants.find((c: any) => n.note_body?.includes(c.name));
    if (!matchedConsultant) return null;
    return { id: matchedConsultant.id, name: matchedConsultant.name, type: "Consultant" };
  }
  if (n.entity_type === "Hostess") {
    const resolvedId = n.person_id;
    const matchedEvent = resolvedId
      ? events.find((e: any) => e.id === resolvedId)
      : events.find((e: any) => e.hostess_name && n.note_body?.includes(e.hostess_name));
    if (!matchedEvent || !matchedEvent.hostess_name) return null;
    return { id: matchedEvent.id, name: matchedEvent.hostess_name, type: "Hostess" };
  }
  return null;
}

export function computeMetricsForDate(dateKey: string, rawData: FocusRawData): {
  reachOuts: number;
  bookings: number;
  sharing: number;
  bookingAttempts: number;
  bookingConversionRate: number;
  reachOutDetails: FocusDetailItem[];
  bookingDetails: FocusDetailItem[];
  sharingDetails: FocusDetailItem[];
  bookingAttemptDetails: FocusDetailItem[];
  coachingDetails: FocusDetailItem[];
  clientFollowUpDetails: FocusDetailItem[];
  hostessCoachingDetails: FocusDetailItem[];
  recruitingFollowUpDetails: FocusDetailItem[];
  relationshipDetails: FocusDetailItem[];
} {
  const { unifiedNotes, allNotes, customers, prospects, bookingLeads, consultants, events } = rawData;
  const contactTypes = new Set(["Call", "Text", "Email", "In Person"]);

  // ─── Reach-out items from unified notes ───
  const reachOutItems: FocusDetailItem[] = unifiedNotes
    .filter((n: any) => {
      const noteDay = n.note_date || getTimestampDateKey(n.created_at);
      if (noteDay !== dateKey) return false;
      if (n.entity_type === "Customer") return CUSTOMER_DAILY_ACTIVITY_TYPES.has(n.note_type);
      if (n.entity_type === "Lead") return true;
      if (n.entity_type === "Consultant") return false; // coaching only
      if (n.entity_type === "Hostess") return true;
      return contactTypes.has(n.note_type);
    })
    .map((n: any) => {
      const resolved = resolveNoteIdentity(n, customers, prospects, bookingLeads, consultants, events);
      if (!resolved) return null;
      return { id: resolved.id, name: resolved.name, type: resolved.type, method: n.note_type, detail: undefined } as FocusDetailItem;
    })
    .filter((item): item is FocusDetailItem => item !== null);

  // ─── Customer notes (legacy table) ───
  const customerNoteItems: FocusDetailItem[] = allNotes
    .filter((n: any) => getTimestampDateKey(n.created_at) === dateKey && CUSTOMER_DAILY_ACTIVITY_TYPES.has(n.note_type))
    .map((n: any) => {
      const c = customers.find((c: any) => c.id === n.customer_id);
      if (!c) return null;
      return { id: n.customer_id, name: c.full_name, type: "Customer", method: n.note_type } as FocusDetailItem;
    })
    .filter((item): item is FocusDetailItem => item !== null);

  // ─── Lead reach-outs ───
  const leadReachOutItems: FocusDetailItem[] = bookingLeads
    .filter((l: any) => l.last_contact_date === dateKey && !l.converted_customer_id)
    .map((l: any) => ({
      id: l.id, name: l.name, type: "Lead", method: "Call",
      detail: l.lead_activity || undefined,
    }));

  // ─── Consultant coaching items (each activity counts separately) ───
  const consultantCoachingItems: FocusDetailItem[] = [];
  for (const n of unifiedNotes) {
    const noteDay = (n as any).note_date || getTimestampDateKey((n as any).created_at);
    const hasCoachingTag = Array.isArray((n as any).tags) && (n as any).tags.includes("consultant_coaching");
    if (noteDay !== dateKey || !hasCoachingTag) continue;
    const resolved = resolveNoteIdentity(n, customers, prospects, bookingLeads, consultants, events);
    if (!resolved || resolved.type !== "Consultant") continue;
    consultantCoachingItems.push({
      id: resolved.id,
      name: resolved.name,
      type: "Consultant",
      method: (n as any).note_type || "Coaching",
      detail: (n as any).note_body?.replace(`[${resolved.name}] `, '').slice(0, 60) || consultants.find((c: any) => c.id === resolved.id)?.coaching_focus || undefined,
    });
  }

  // ─── Deduplicated reach-outs (excludes consultants) ───
  const seenIds = new Set<string>();
  const allReachOutItems: FocusDetailItem[] = [];
  for (const item of [...reachOutItems, ...customerNoteItems, ...leadReachOutItems]) {
    if (!seenIds.has(item.id)) { seenIds.add(item.id); allReachOutItems.push(item); }
  }

  // ─── Bookings (events created on date) ───
  const bookingItems: FocusDetailItem[] = events
    .filter((e: any) => e.created_at.startsWith(dateKey))
    .map((e: any) => ({
      id: e.event_id, name: e.hostess_name || e.event_id, type: "Event",
      detail: e.event_type || undefined,
    }));

  // ─── Booking attempt items ───
  const bookingAttemptItems: FocusDetailItem[] = unifiedNotes
    .filter((n: any) => {
      const noteDay = n.note_date || getTimestampDateKey(n.created_at);
      return noteDay === dateKey && n.is_booking_attempt === true;
    })
    .map((n: any) => {
      const resolved = resolveNoteIdentity(n, customers, prospects, bookingLeads, consultants, events);
      if (!resolved) return null;
      return { id: resolved.id, name: resolved.name, type: resolved.type, method: n.note_type, detail: n.note_body?.slice(0, 60) || undefined, isBookingAttempt: true } as FocusDetailItem;
    })
    .filter((item): item is FocusDetailItem => item !== null);

  const leadBookingAttemptItems: FocusDetailItem[] = bookingLeads
    .filter((l: any) => l.last_contact_date === dateKey && !l.converted_customer_id)
    .map((l: any) => ({
      id: l.id, name: l.name, type: "Lead",
      method: l.lead_activity || "Call",
      detail: undefined,
      isBookingAttempt: true,
    }));

  const seenAttemptIds = new Set<string>();
  const allBookingAttemptItems: FocusDetailItem[] = [];
  for (const item of [...bookingAttemptItems, ...leadBookingAttemptItems]) {
    if (!seenAttemptIds.has(item.id)) { seenAttemptIds.add(item.id); allBookingAttemptItems.push(item); }
  }

  // ─── Sharing items ───
  const sharingItems: FocusDetailItem[] = [
    ...prospects
      .filter((p: any) => p.opportunity_status === "Shared" && p.updated_at?.startsWith(dateKey))
      .map((p: any) => ({ id: p.id, name: p.name, type: "Prospect" as const, detail: "Shared Opportunity" })),
    ...events
      .filter((e: any) => e.event_date === dateKey && ((e as any).sharing_appointments_count || 0) > 0)
      .map((e: any) => ({
        id: e.event_id, name: e.hostess_name || e.event_id, type: "Event" as const,
        detail: `${(e as any).sharing_appointments_count} sharing appt${((e as any).sharing_appointments_count || 0) > 1 ? "s" : ""}`,
      })),
  ];
  const sharingFromEvents = events
    .filter((e: any) => e.event_date === dateKey)
    .reduce((sum: number, e: any) => sum + ((e as any).sharing_appointments_count || 0), 0);

  const bookingAttemptsCount = allBookingAttemptItems.length;
  const bookingsCount = bookingItems.length;
  const conversionRate = bookingAttemptsCount > 0 ? Math.round((bookingsCount / bookingAttemptsCount) * 100) : 0;

  return {
    reachOuts: allReachOutItems.length,
    bookings: bookingsCount,
    sharing: sharingItems.filter(s => s.type === "Prospect").length + sharingFromEvents,
    bookingAttempts: bookingAttemptsCount,
    bookingConversionRate: conversionRate,
    reachOutDetails: allReachOutItems,
    bookingDetails: bookingItems,
    sharingDetails: sharingItems,
    bookingAttemptDetails: allBookingAttemptItems,
    coachingDetails: consultantCoachingItems,
  };
}