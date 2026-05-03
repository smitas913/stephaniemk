import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * Days after order date for the standard product check-in follow-up.
 */
export const ORDER_FOLLOWUP_DAYS = 14;

/**
 * Days after order date for the "needs new catalog" follow-up.
 */
export const CATALOG_FOLLOWUP_DAYS = 25;

interface ApplyPostOrderFollowUpInput {
  customerId: string;
  orderDate: string; // YYYY-MM-DD
  needsCatalog?: boolean;
}

/**
 * After an order is entered:
 *  - Compute the post-order follow-up date (orderDate + 14, or +25 if catalog).
 *  - Compare to the customer's existing next_follow_up_date.
 *      Keep whichever is sooner (and still in the future).
 *  - Write that date to customers.next_follow_up_date.
 *  - Clear today/overdue follow-up so it falls off Today's list.
 *  - Log an audit entry in customer_notes describing what was scheduled.
 *
 * NOTE: We intentionally do NOT insert into the `notes` table here, because
 * its trigger would bump `last_contacted` (an order is not a contact touch).
 * We use `customer_notes` (no trigger) for the audit trail instead.
 */
export async function applyPostOrderFollowUp({
  customerId,
  orderDate,
  needsCatalog = false,
}: ApplyPostOrderFollowUpInput): Promise<void> {
  if (!customerId || !orderDate) return;

  const todayKey = format(new Date(), "yyyy-MM-dd");
  // Backdated orders should not (re)schedule any follow-up.
  if (orderDate < todayKey) return;

  const baseDate = parseISO(orderDate);
  const offset = needsCatalog ? CATALOG_FOLLOWUP_DAYS : ORDER_FOLLOWUP_DAYS;
  const proposed = format(addDays(baseDate, offset), "yyyy-MM-dd");

  // Read existing follow-up
  const { data: cust, error: readErr } = await supabase
    .from("customers")
    .select("id, next_follow_up_date")
    .eq("id", customerId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!cust) return;

  const existing = (cust as any).next_follow_up_date as string | null;

  // Priority: keep the existing date only if it is sooner AND still in the
  // future (not overdue / not today). Otherwise replace with the proposed date.
  let resolved = proposed;
  if (existing && existing > todayKey && existing < proposed) {
    resolved = existing;
  }

  const reason = needsCatalog
    ? "New Catalog Follow-Up"
    : "Product Check-In / Order Follow-Up";

  await supabase
    .from("customers")
    .update({
      next_follow_up_date: resolved,
      follow_up_reason: reason,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", customerId);

  // Audit log (no trigger side effects)
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("customer_notes").insert({
    customer_id: customerId,
    note_type: "Order Follow-Up Scheduled",
    note_text: `Order entered on ${orderDate}. Next follow-up set for ${resolved} — ${reason}.`,
    owner_user_id: auth.user?.id ?? null,
  } as any);
}
