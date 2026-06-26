import { toLocalDateKey } from "@/lib/dateOnly";

export interface FocusDetailItem {
  id: string;
  name: string;
  type: string;
  method?: string;
  detail?: string;
  isBookingAttempt?: boolean;
  isFollowUp?: boolean;
}

export interface FocusRawData {
  unifiedNotes: any[];
  allNotes: any[];
  customers: any[];
  prospects: any[];
  bookingLeads: any[];
  consultants: any[];
  events: any[];
}

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
  bookingActivity: number;
  bookingConversionRate: number;
  reachOutDetails: FocusDetailItem[];
  bookingDetails: FocusDetailItem[];
  sharingDetails: FocusDetailItem[];
  bookingAttemptDetails: FocusDetailItem[];
  bookingActivityDetails: FocusDetailItem[];
  coachingDetails: FocusDetailItem[];
  clientFollowUpDetails: FocusDetailItem[];
  customerFollowUpDetails: FocusDetailItem[];
  hostessCoachingDetails: FocusDetailItem[];
  recruitingFollowUpDetails: FocusDetailItem[];
  relationshipDetails: FocusDetailItem[];
} {
  const { unifiedNotes, allNotes, customers, prospects, bookingLeads, consultants, events } = rawData;
  const contactTypes = new Set(["Call", "Text", "Email", "In Person"]);
  // Notes that represent administrative/cleanup actions — never count as outreach or booking activity.
  const NON_OUTREACH_NOTE_TYPES = new Set([
    "Skipped", "No Follow-Up", "No Follow-Up Needed", "Cleared", "DNC", "Not Interested",
  ]);
  const isOutreachNote = (n: any) => {
    if (NON_OUTREACH_NOTE_TYPES.has(n.note_type)) return false;
    // Notes flagged as not a follow-up AND not a booking attempt are administrative (skip/dnc/cleared).
    if (n.is_follow_up === false && n.is_booking_attempt === false) return false;
    // Body-tag heuristics for DNC/no-follow-up notes that may slip through with contact note_types.
    const body = (n.note_body || "").toLowerCase();
    if (body.includes("[not interested") || body.includes("[dnc]") || body.includes("no follow-up needed")) return false;
    return true;
  };

  // ─── Reach-out items from unified notes ───
  const reachOutItems: FocusDetailItem[] = unifiedNotes
    .filter((n: any) => {
      const noteDay = getTimestampDateKey(n.created_at) || n.note_date;
      if (noteDay !== dateKey) return false;
      if (!isOutreachNote(n)) return false;
      if (n.entity_type === "Customer") return CUSTOMER_DAILY_ACTIVITY_TYPES.has(n.note_type);
      if (n.entity_type === "Lead") return contactTypes.has(n.note_type);
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
  // Only count leads with a real outreach note today (Call/Text/Email/In Person and NOT skip/DNC).
  // Previously this used `last_contact_date === today`, which incorrectly included
  // DNC / Not Interested / cleared follow-ups (those mutations also stamp last_contact_date).
  const leadIdsWithOutreachToday = new Set<string>();
  const leadIdsWithBookingAttemptToday = new Set<string>();
  for (const n of unifiedNotes as any[]) {
    if (n.entity_type !== "Lead") continue;
    const noteDay = getTimestampDateKey(n.created_at) || n.note_date;
    if (noteDay !== dateKey) continue;
    if (!isOutreachNote(n)) continue;
    if (!contactTypes.has(n.note_type)) continue;
    const id = n.person_id;
    if (!id) continue;
    leadIdsWithOutreachToday.add(id);
    if (n.is_booking_attempt === true) leadIdsWithBookingAttemptToday.add(id);
  }
  const leadReachOutItems: FocusDetailItem[] = bookingLeads
    .filter((l: any) =>
      leadIdsWithOutreachToday.has(l.id) &&
      !l.converted_customer_id &&
      l.status !== "Not Interested",
    )
    .map((l: any) => ({
      id: l.id, name: l.name, type: "Lead", method: "Call",
      detail: l.lead_activity || undefined,
    }));

  // ─── Consultant coaching items (each activity counts separately) ───
  const consultantCoachingItems: FocusDetailItem[] = [];
  for (const n of unifiedNotes) {
    const noteDay = getTimestampDateKey((n as any).created_at) || (n as any).note_date;
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
    .filter((e: any) => getTimestampDateKey(e.created_at) === dateKey)
    .map((e: any) => ({
      id: e.event_id, name: e.hostess_name || e.event_id, type: "Event",
      detail: e.event_type || undefined,
    }));

  // ─── Booking attempt items ───
  const bookingAttemptItems: FocusDetailItem[] = unifiedNotes
    .filter((n: any) => {
      const noteDay = getTimestampDateKey(n.created_at) || n.note_date;
      if (noteDay !== dateKey) return false;
      if (n.is_booking_attempt !== true) return false;
      // Exclude administrative/cleanup notes even if mistakenly flagged.
      if (!isOutreachNote(n)) return false;
      // Exclude rebook sequence notes — those go to Booking Activity not attempts
      if (n.note_body?.includes("Rebook attempt")) return false;
      if (n.entity_type === "Hostess") return false;
      return true;
    })
    .map((n: any) => {
      const resolved = resolveNoteIdentity(n, customers, prospects, bookingLeads, consultants, events);
      if (!resolved) return null;
      return { id: resolved.id, name: resolved.name, type: resolved.type, method: n.note_type, detail: n.note_body?.slice(0, 60) || undefined, isBookingAttempt: true } as FocusDetailItem;
    })
    .filter((item): item is FocusDetailItem => item !== null);

  const leadBookingAttemptItems: FocusDetailItem[] = bookingLeads
    .filter((l: any) =>
      leadIdsWithBookingAttemptToday.has(l.id) &&
      !l.converted_customer_id &&
      l.status !== "Not Interested",
    )
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
      .filter((p: any) => p.opportunity_status === "Shared" && getTimestampDateKey(p.updated_at) === dateKey)
      .map((p: any) => ({ id: p.id, name: p.name, type: "Prospect" as const, detail: "Shared Opportunity" })),
    ...events
      .filter((e: any) => e.event_date === dateKey && (0) > 0)
      .map((e: any) => ({
        id: e.event_id, name: e.hostess_name || e.event_id, type: "Event" as const,
        detail: `${(e as any).sharing_appointments_count} sharing appt${(0) > 1 ? "s" : ""}`,
      })),
  ];
  const sharingFromEvents = events
    .filter((e: any) => e.event_date === dateKey)
    .reduce((sum: number, e: any) => sum + (0), 0);

  // ─── Client/Lead Follow-Up details (customer + lead activities, deduplicated) ───
  const clientFollowUpItems: FocusDetailItem[] = allReachOutItems.filter(
    (item) => item.type === "Customer" || item.type === "Lead"
  );
  const customerFollowUpItems: FocusDetailItem[] = allReachOutItems.filter(
    (item) => item.type === "Customer"
  );
  const leadFollowUpItems: FocusDetailItem[] = allReachOutItems.filter(
    (item) => item.type === "Lead"
  );

  // ─── Hostess/Event Coaching details ───
  // Shows upcoming event prep tasks due today or overdue
  const hostessCoachingItems: FocusDetailItem[] = [];
  // From unified notes with Hostess entity type
  for (const item of allReachOutItems) {
    if (item.type === "Hostess") hostessCoachingItems.push(item);
  }
  // Also include event-related coaching/prep notes
  for (const n of unifiedNotes) {
    const noteDay = getTimestampDateKey((n as any).created_at) || (n as any).note_date;
    if (noteDay !== dateKey) continue;
    if ((n as any).entity_type !== "Hostess") continue;
    const resolved = resolveNoteIdentity(n, customers, prospects, bookingLeads, consultants, events);
    if (!resolved) continue;
    if (!hostessCoachingItems.some(h => h.id === resolved.id)) {
      hostessCoachingItems.push({
        id: resolved.id, name: resolved.name, type: "Hostess",
        method: (n as any).note_type, detail: undefined,
      });
    }
  }
  // Include upcoming events with overdue/due-today prep tasks
  for (const e of events) {
    if ((e as any).event_status === "Cancelled") continue;
    if ((e as any).event_status === "Held") continue;
    if (!e.hostess_name) continue;
    // Check if this event has tasks due today or overdue
    const evTasks = (e as any)._tasks || [];
    const hasDueTask = evTasks.some((t: any) =>
      !t.is_completed && t.due_date && t.due_date <= dateKey
    );
    if (hasDueTask && !hostessCoachingItems.some(h => h.id === e.id)) {
      hostessCoachingItems.push({
        id: e.id,
        name: e.hostess_name,
        type: "Hostess",
        method: "Event Prep",
        detail: `${e.event_type || "Event"} · ${(e as any).event_date || ""}`,
      });
    }
  }

  // ─── Recruiting Follow-Up details (prospect activities) ───
  const recruitingFollowUpItems: FocusDetailItem[] = [];
  for (const n of unifiedNotes) {
    const noteDay = getTimestampDateKey((n as any).created_at) || (n as any).note_date;
    if (noteDay !== dateKey) continue;
    if ((n as any).entity_type !== "Prospect") continue;
    const resolved = resolveNoteIdentity(n, customers, prospects, bookingLeads, consultants, events);
    if (!resolved) continue;
    if (!recruitingFollowUpItems.some(r => r.id === resolved.id)) {
      recruitingFollowUpItems.push({
        id: resolved.id, name: resolved.name, type: "Prospect",
        method: (n as any).note_type, detail: undefined,
      });
    }
  }
  // Also include prospects with last_contact_date = dateKey
  for (const p of prospects) {
    if ((p as any).last_contact_date === dateKey && !recruitingFollowUpItems.some(r => r.id === p.id)) {
      recruitingFollowUpItems.push({ id: p.id, name: p.name, type: "Prospect", detail: (p as any).opportunity_status || undefined });
    }
  }

  // ─── Relationship Building details (intentional personal touches only) ───
  // Excludes activity logs (Face / Career Chat / Booking Conversation) — those have a result_type set.
  const relTypes = new Set(["General", "Gift", "Check-in", "Birthday", "Other"]);
  const relationshipItems: FocusDetailItem[] = allNotes
    .filter((n: any) => getTimestampDateKey(n.created_at) === dateKey && relTypes.has(n.note_type) && !n.result_type)
    .map((n: any) => {
      const c = customers.find((c: any) => c.id === n.customer_id);
      if (!c) return null;
      return { id: n.customer_id, name: c.full_name, type: "Customer", method: n.note_type } as FocusDetailItem;
    })
    .filter((item): item is FocusDetailItem => item !== null);
  // Deduplicate
  const relSeen = new Set<string>();
  const dedupedRelationship: FocusDetailItem[] = [];
  for (const item of relationshipItems) {
    if (!relSeen.has(item.id)) { relSeen.add(item.id); dedupedRelationship.push(item); }
  }

  const bookingAttemptsCount = allBookingAttemptItems.length;
  const bookingsCount = bookingItems.length;
  const conversionRate = bookingAttemptsCount > 0 ? Math.round((bookingsCount / bookingAttemptsCount) * 100) : 0;

  // ─── Booking Activity (any lead interaction + any booking attempt, deduplicated) ───
  const bookingActivitySeen = new Set<string>();
  const bookingActivityItems: FocusDetailItem[] = [];
  for (const item of [...leadFollowUpItems, ...allBookingAttemptItems]) {
    const k = `${item.type}:${item.id}`;
    if (!bookingActivitySeen.has(k)) {
      bookingActivitySeen.add(k);
      bookingActivityItems.push(item);
    }
  }

  // ─── Rescheduling events → Booking Activity ───
  // Only count a rescheduling event if a reschedule outreach note was actually logged today.
  // Open/unresolved reschedules with no new action today must NOT inflate the daily count.
  for (const e of events) {
    const rescheduleStatus = (e as any).reschedule_status;
    if (rescheduleStatus !== "In Process of Rescheduling") continue;
    const loggedToday = (e as any).reschedule_last_contact_date === dateKey;
    if (!loggedToday) continue;
    const k = `Event:${e.id}`;
    if (!bookingActivitySeen.has(k)) {
      bookingActivitySeen.add(k);
      bookingActivityItems.push({
        id: e.id,
        name: e.hostess_name || e.event_id,
        type: "Lead" as any,
        method: "Reschedule",
        detail: `Rescheduling · was ${(e as any).event_type || "Event"}`,
      });
    }
  }

  return {
    reachOuts: allReachOutItems.length,
    bookings: bookingsCount,
    sharing: sharingItems.filter(s => s.type === "Prospect").length + sharingFromEvents,
    bookingAttempts: bookingAttemptsCount,
    bookingActivity: bookingActivityItems.length,
    bookingConversionRate: conversionRate,
    reachOutDetails: allReachOutItems,
    bookingDetails: bookingItems,
    sharingDetails: sharingItems,
    bookingAttemptDetails: allBookingAttemptItems,
    bookingActivityDetails: bookingActivityItems,
    coachingDetails: consultantCoachingItems,
    clientFollowUpDetails: clientFollowUpItems,
    customerFollowUpDetails: customerFollowUpItems,
    hostessCoachingDetails: hostessCoachingItems,
    recruitingFollowUpDetails: recruitingFollowUpItems,
    relationshipDetails: dedupedRelationship,
  };
}
