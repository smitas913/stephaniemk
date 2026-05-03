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
    const d2w = addDays(14);
    const d2m = addDays(60);
    nextDate = d2;
    reason = "Product Check-In / Order Follow-Up";
    stage = "2 Day";
    planNote =
      `2+2+2 follow-up sequence started${baseDate ? ` from order date ${baseDate}` : ""}:\n` +
      `• Step 1 — ${d2}: 2 Day — Initial product experience check-in\n` +
      `• Step 2 — ${d2w}: 2 Week — Reorder / appointment opportunity\n` +
      `• Step 3 — ${d2m}: 2 Month / PCP — Transition to long-term care`;
  } else if (choice === "custom" && customDate) {
    nextDate = customDate;
    reason = "Custom follow-up";
  } else {
    nextDate = addDays(75);
    reason = "90-Day Care Cycle";
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
