import { createNote, updateCustomer } from "@/lib/queries";
import { toLocalDateKey } from "@/lib/dateOnly";

export type FollowUpChoice = "222" | "custom" | "default";

export async function applyNewCustomerFollowUp(
  customerId: string,
  choice: FollowUpChoice,
  customDate?: string,
): Promise<{ nextDate: string; reason: string }> {
  const today = new Date();
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return toLocalDateKey(d);
  };

  let nextDate: string;
  let reason: string;
  let planNote: string | null = null;

  if (choice === "222") {
    const d2 = addDays(2);
    const d2w = addDays(14);
    const d2m = addDays(60);
    nextDate = d2;
    reason = "2+2+2 Sequence — Step 1 of 3 (initial check-in)";
    planNote =
      `2+2+2 follow-up sequence started:\n` +
      `• Step 1 — ${d2}: Initial product experience check-in\n` +
      `• Step 2 — ${d2w}: Reorder / appointment opportunity\n` +
      `• Step 3 — ${d2m}: Transition to long-term care`;
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
