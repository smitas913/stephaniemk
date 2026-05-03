import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Explicit user-selected follow-up intent for a new order.
 * "none" → do not schedule any follow-up.
 */
export type FollowUpIntent =
  | "none"
  | "product_checkin_2w"
  | "reorder_30"
  | "reorder_60"
  | "reorder_90"
  | "booking_opportunity";

export const FOLLOW_UP_INTENT_OPTIONS: { value: FollowUpIntent; label: string; days: number | null; reason: string }[] = [
  { value: "none", label: "None", days: null, reason: "" },
  { value: "product_checkin_2w", label: "Product Check-In (2 weeks)", days: 14, reason: "Product Check-In" },
  { value: "reorder_30", label: "Reorder Reminder (30 days)", days: 30, reason: "Reorder Reminder" },
  { value: "reorder_60", label: "Reorder Reminder (60 days)", days: 60, reason: "Reorder Reminder" },
  { value: "reorder_90", label: "Reorder Reminder (90 days)", days: 90, reason: "Reorder Reminder" },
  { value: "booking_opportunity", label: "Booking Opportunity (7 days)", days: 7, reason: "Booking Opportunity" },
];

interface ApplyPostOrderFollowUpInput {
  customerId: string;
  orderDate: string; // YYYY-MM-DD
  intent: FollowUpIntent;
}

/**
 * Schedule a follow-up only when the user explicitly selects a Follow-Up Intent.
 *  - intent "none" → no-op.
 *  - Otherwise compute orderDate + intent.days, keeping existing next_follow_up_date
 *    if it is sooner and still in the future. Audit logged in customer_notes.
 */
export async function applyPostOrderFollowUp({
  customerId,
  orderDate,
  intent,
}: ApplyPostOrderFollowUpInput): Promise<void> {
  if (!customerId || !orderDate) return;
  if (!intent || intent === "none") return;

  const opt = FOLLOW_UP_INTENT_OPTIONS.find((o) => o.value === intent);
  if (!opt || opt.days == null) return;

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const baseDate = parseISO(orderDate);
  const proposed = format(addDays(baseDate, opt.days), "yyyy-MM-dd");
  if (proposed <= todayKey) return;

  const { data: cust, error: readErr } = await supabase
    .from("customers")
    .select("id, next_follow_up_date")
    .eq("id", customerId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!cust) return;

  const existing = (cust as any).next_follow_up_date as string | null;
  let resolved = proposed;
  if (existing && existing > todayKey && existing < proposed) {
    resolved = existing;
  }

  await supabase
    .from("customers")
    .update({
      next_follow_up_date: resolved,
      follow_up_reason: opt.reason,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", customerId);

  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("customer_notes").insert({
    customer_id: customerId,
    note_type: "Order Follow-Up Scheduled",
    note_text: `Order on ${orderDate} → ${opt.label} scheduled for ${resolved}.`,
    owner_user_id: auth.user?.id ?? null,
  } as any);
}
