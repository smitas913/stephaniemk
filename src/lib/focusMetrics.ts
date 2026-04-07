import { toLocalDateKey } from "@/lib/dateOnly";
import type { FocusDetailItem, FocusRawData } from "@/components/TodaysFocus";

const CUSTOMER_DAILY_ACTIVITY_TYPES = new Set(["Call", "Text", "Email", "In Person", "Delivery", "Reorder Conversation", "Did Not Connect"]);

function getTimestampDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateKey(parsed);
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
} {
  const { unifiedNotes, allNotes, customers, prospects, bookingLeads, consultants, events } = rawData;
  const contactTypes = new Set(["Call", "Text", "Email", "In Person"]);

  const reachOutItems: FocusDetailItem[] = unifiedNotes
    .filter((n: any) => {
      const noteDay = n.note_date || getTimestampDateKey(n.created_at);
      if (noteDay !== dateKey) return false;
      return n.entity_type === "Customer"
        ? CUSTOMER_DAILY_ACTIVITY_TYPES.has(n.note_type)
        : contactTypes.has(n.note_type);
    })
    .map((n: any) => {
      let name = "Unknown";
      let type = n.entity_type || "Customer";
      let id = n.customer_id || n.prospect_id || n.id;
      if (n.entity_type === "Customer" && n.customer_id) {
        const c = customers.find((c: any) => c.id === n.customer_id);
        name = c?.full_name || "Customer";
        id = n.customer_id;
        type = "Customer";
      } else if (n.entity_type === "Prospect" && n.prospect_id) {
        const p = prospects.find((p: any) => p.id === n.prospect_id);
        name = p?.name || "Prospect";
        id = n.prospect_id;
        type = "Prospect";
      }
      return { id, name, type, method: n.note_type, detail: undefined };
    });

  const customerNoteItems: FocusDetailItem[] = allNotes
    .filter((n: any) => getTimestampDateKey(n.created_at) === dateKey && CUSTOMER_DAILY_ACTIVITY_TYPES.has(n.note_type))
    .map((n: any) => {
      const c = customers.find((c: any) => c.id === n.customer_id);
      return { id: n.customer_id || n.id, name: c?.full_name || "Customer", type: "Customer", method: n.note_type };
    });

  const leadReachOutItems: FocusDetailItem[] = bookingLeads
    .filter((l: any) => l.last_contact_date === dateKey && !l.converted_customer_id)
    .map((l: any) => ({
      id: l.id, name: l.name, type: "Lead", method: "Call",
      detail: l.lead_activity || undefined,
    }));

  const consultantReachOutItems: FocusDetailItem[] = [];
  for (const c of consultants) {
    const updatedThatDay = (c as any).updated_at?.startsWith(dateKey);
    const coachingAdvanced = (c as any).next_coaching_date && (c as any).next_coaching_date > dateKey;
    if (updatedThatDay && coachingAdvanced) {
      consultantReachOutItems.push({
        id: (c as any).id, name: (c as any).name, type: "Consultant",
        method: "Coaching", detail: (c as any).coaching_focus || undefined,
      });
    }
  }

  const seenIds = new Set<string>();
  const allReachOutItems: FocusDetailItem[] = [];
  for (const item of [...reachOutItems, ...customerNoteItems, ...leadReachOutItems, ...consultantReachOutItems]) {
    if (!seenIds.has(item.id)) { seenIds.add(item.id); allReachOutItems.push(item); }
  }

  const bookingItems: FocusDetailItem[] = events
    .filter((e: any) => e.created_at.startsWith(dateKey))
    .map((e: any) => ({
      id: e.event_id, name: e.hostess_name || e.event_id, type: "Event",
      detail: e.event_type || undefined,
    }));

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

  return {
    reachOuts: allReachOutItems.length,
    bookings: bookingItems.length,
    sharing: sharingItems.filter(s => s.type === "Prospect").length + sharingFromEvents,
    reachOutDetails: allReachOutItems,
    bookingDetails: bookingItems,
    sharingDetails: sharingItems,
  };
}
