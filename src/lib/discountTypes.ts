import { supabase } from "@/integrations/supabase/client";

export interface DiscountType {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_DISCOUNT_TYPES = [
  "Birthday Discount",
  "Half Price Deal",
  "Hostess Credit",
  "Referral Gift",
  "Other",
];

const getUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
};

export async function fetchDiscountTypes(): Promise<DiscountType[]> {
  const { data, error } = await supabase
    .from("discount_types")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as DiscountType[];
}

/** Seeds defaults for the current user if they have none. Returns the (possibly seeded) list. */
export async function ensureDefaultDiscountTypes(): Promise<DiscountType[]> {
  const userId = await getUserId();
  if (!userId) return [];
  const existing = await fetchDiscountTypes();
  if (existing.length > 0) return existing;
  const rows = DEFAULT_DISCOUNT_TYPES.map((name, i) => ({
    user_id: userId,
    name,
    sort_order: i,
    is_archived: false,
  }));
  const { data, error } = await supabase
    .from("discount_types")
    .insert(rows)
    .select();
  if (error) throw error;
  return (data || []) as DiscountType[];
}

export async function createDiscountType(name: string, sort_order: number): Promise<DiscountType> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("discount_types")
    .insert({ user_id: userId, name, sort_order, is_archived: false })
    .select()
    .single();
  if (error) throw error;
  return data as DiscountType;
}

export async function updateDiscountType(
  id: string,
  patch: Partial<Pick<DiscountType, "name" | "sort_order" | "is_archived">>,
): Promise<void> {
  const { error } = await supabase.from("discount_types").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDiscountType(id: string): Promise<void> {
  const { error } = await supabase.from("discount_types").delete().eq("id", id);
  if (error) throw error;
}
