import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Standardized Follow-Up Intent vocabulary used across the app
 * (Order Entry, Customer / Event / Prospect follow-up flows).
 *
 * "none" → do not schedule any follow-up.
 */
export type FollowUpIntent =
  | "none"
  | "quick_touch"
  | "check_in"
  | "reorder_30"
  | "reorder_60"
  | "reorder_90"
  | "custom"
  | "booking"
  | "reschedule";

export type FollowUpIntentContext = "order" | "customer" | "event" | "prospect";

export interface FollowUpIntentOption {
  value: FollowUpIntent;
  label: string;
  days: number | null;
  reason: string;
  /** Contexts where this option should appear. */
  contexts: FollowUpIntentContext[];
}

export const FOLLOW_UP_INTENT_OPTIONS: FollowUpIntentOption[] = [
  {
    value: "none",
    label: "No Follow-Up",
    days: null,
    reason: "",
    contexts: ["order", "customer", "event", "prospect"],
  },
  {
    value: "quick_touch",
    label: "Quick Touch (2 days)",
    days: 2,
    reason: "Quick Touch",
    contexts: ["customer", "event", "prospect"],
  },
  {
    value: "check_in",
    label: "Check-In (7 days)",
    days: 7,
    reason: "Check-In",
    contexts: ["customer", "prospect"],
  },
  {
    value: "reorder_30",
    label: "Reorder Cycle (30 days)",
    days: 30,
    reason: "Reorder Cycle",
    contexts: ["customer"],
  },
  {
    value: "reorder_60",
    label: "Reorder Cycle (60 days)",
    days: 60,
    reason: "Reorder Cycle",
    contexts: ["customer"],
  },
  {
    value: "reorder_90",
    label: "Reorder Cycle (90 days)",
    days: 90,
    reason: "Reorder Cycle",
    contexts: ["order", "customer"],
  },
  {
    value: "custom",
    label: "Custom Date…",
    days: null,
    reason: "Custom follow-up",
    contexts: ["order", "customer"],
  },
  {
    value: "booking",
    label: "Booking Follow-Up (2 days)",
    days: 2,
    reason: "Booking Follow-Up",
    contexts: ["customer", "event", "prospect"],
  },
  { value: "reschedule", label: "Reschedule (2 days)", days: 2, reason: "Reschedule", contexts: ["event"] },
];

/** Return only the intent options relevant to a given context. */
export function getFollowUpIntentOptions(context: FollowUpIntentContext): FollowUpIntentOption[] {
  return FOLLOW_UP_INTENT_OPTIONS.filter((o) => o.contexts.includes(context));
}

interface ApplyPostOrderFollowUpInput {
  customerId: string;
  orderDate: string; // YYYY-MM-DD
  intent: FollowUpIntent;
}

/**
 * Schedule a follow-up only when the user explicitly selects a Follow-Up Intent.
 *  - intent "none" → no-op.
 *  - For backdated orders, calculates from TODAY so the follow-up is always in the future.
 *  - For today's orders, calculates from the order date + intent.days.
 *  - Keeps existing next_follow_up_date if it is sooner and still in the future.
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
  // Always base follow-up from today for backdated orders so it lands in the future
  const baseDate = orderDate < todayKey ? new Date() : parseISO(orderDate);
  const proposed = format(addDays(baseDate, opt.days), "yyyy-MM-dd");

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
