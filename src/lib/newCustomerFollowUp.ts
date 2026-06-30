import { createNote, updateCustomer } from "@/lib/queries";
import { toLocalDateKey, parseLocalDate } from "@/lib/dateOnly";

export type FollowUpChoice = "222" | "custom" | "default";

/**
 * Apply a new-customer follow-up plan.
 *
 * @param baseDate Optional anchor date (YYYY-MM-DD). When provided, the 2+2+2
 *   and 90-Day Care Cycle offsets are calculated from this date — typically the
 *   order date / Became Customer Date — instead of today. This keeps the
 *   product-experience cadence aligned with the actual purchase timeline.
 */
export async function applyNewCustomerFollowUp(
  customerId: string,
  choice: FollowUpChoice,
  customDate?: string,
  baseDate?: string,
): Promise<{ nextDate: string; reason: string }> {
  const anchor = baseDate ? parseLocalDate(baseDate) : new Date();
  const addDays = (n: number) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + n);
    return toLocalDateKey(d);
  };

  let nextDate: string;
  let reason: string;
  let planNote: string | null = null;
  let stage: string | null = null;

  if (choice === "222") {
    const d2 = addDays(2);
    const d4 = addDays(4);
    const d6 = addDays(6);
    nextDate = d2;
    reason = "Product Check-In / Order Follow-Up";
    stage = "Day 2";
    planNote =
      `2+2+2 follow-up sequence started${baseDate ? ` from order date ${baseDate}` : ""}:\n` +
      `• Day 2 — ${d2}: Initial product experience check-in\n` +
      `• Day 4 — ${d4}: Follow up on experience\n` +
      `• Day 6 — ${d6}: Transition to 30-day cycle`;
  } else if (choice === "custom" && customDate) {
    nextDate = customDate;
    reason = "Custom follow-up";
  } else {
    nextDate = addDays(30);
    reason = "30-Day Follow-Up";
  }

  await updateCustomer(customerId, {
    next_follow_up_date: nextDate,
    follow_up_reason: reason,
    new_follow_up_stage: stage,
  } as any);

  if (planNote) {
    await createNote({
      entity_type: "Customer",
      customer_id: customerId,
      person_id: customerId,
      person_type: "customer",
      note_body: planNote,
      note_type: "Follow-Up",
      next_follow_up_date: nextDate,
      is_booking_attempt: false,
      is_follow_up: true,
    });
  }

  return { nextDate, reason };
}
