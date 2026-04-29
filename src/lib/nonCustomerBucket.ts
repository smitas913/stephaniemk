import { supabase } from "@/integrations/supabase/client";

/**
 * Marker name used for the per-owner "Non-Customer Orders" bucket customer.
 * This synthetic customer holds orders from one-time/online/support buyers
 * who should NOT enter the follow-up system. The record is kept archived
 * (is_active=false, archived_at set) so it never appears in customer lists,
 * follow-up queues, or customer metrics.
 */
export const NON_CUSTOMER_BUCKET_NAME = "Non-Customer Orders";

/**
 * Get or create the archived bucket customer for the current owner.
 * Returns the customer id to use as orders.customer_id for non-customer orders.
 */
export async function getOrCreateNonCustomerBucket(ownerUserId: string | null): Promise<string> {
  // Look up existing bucket for this owner
  const { data: existing, error: readErr } = await supabase
    .from("customers")
    .select("id")
    .eq("full_name", NON_CUSTOMER_BUCKET_NAME)
    .eq("owner_user_id", ownerUserId as any)
    .eq("is_active", false)
    .limit(1)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing?.id) return existing.id as string;

  // Create it (archived from the start so it's excluded everywhere)
  const { data: created, error: insErr } = await supabase
    .from("customers")
    .insert({
      full_name: NON_CUSTOMER_BUCKET_NAME,
      owner_user_id: ownerUserId,
      is_active: false,
      archived_at: new Date().toISOString(),
      relationship_status: "Customer",
      notes: "System-managed bucket for one-time/online/support orders. Do not use for follow-up.",
    } as any)
    .select("id")
    .single();
  if (insErr) throw insErr;
  return (created as any).id as string;
}
