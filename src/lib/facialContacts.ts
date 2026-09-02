import { supabase } from "@/integrations/supabase/client";
import type { FacialContact } from "@/lib/types";
import { normalizePhoneForStorage } from "@/lib/phoneUtils";
import { beautyProfileSearchText } from "@/lib/beautyProfile";

type FacialContactInput = Partial<FacialContact> & { full_name: string };

const withPhone = <T extends Record<string, any>>(payload: T): T => {
  const next: any = { ...payload };
  if ("phone" in next) next.phone = normalizePhoneForStorage(next.phone);
  return next;
};

export const fetchFacialContacts = async (): Promise<FacialContact[]> => {
  const { data, error } = await supabase
    .from("facial_contacts")
    .select("*")
    .order("facial_date", { ascending: false, nullsFirst: false })
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as unknown as FacialContact[];
};

export const fetchFacialContact = async (id: string): Promise<FacialContact> => {
  const { data, error } = await supabase.from("facial_contacts").select("*").eq("id", id).single();
  if (error) throw error;
  return data as unknown as FacialContact;
};

export const createFacialContact = async (input: FacialContactInput): Promise<FacialContact> => {
  const { data: userData } = await supabase.auth.getUser();
  const owner = userData?.user?.id;
  if (!owner) throw new Error("You must be signed in to add a facial contact");
  const { data, error } = await supabase
    .from("facial_contacts")
    .insert(withPhone({ ...input, owner_user_id: owner }) as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as FacialContact;
};

export const updateFacialContact = async (id: string, updates: Partial<FacialContact>) => {
  const { data, error } = await supabase
    .from("facial_contacts")
    .update(withPhone(updates) as any)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as FacialContact;
};

export const deleteFacialContact = async (id: string) => {
  const { error } = await supabase.from("facial_contacts").delete().eq("id", id);
  if (error) throw error;
};

/** Free-text match across name, phone, email, skin type, shade and Beauty Profile. */
export const facialContactMatches = (c: FacialContact, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (beautyProfileSearchText((c as any).beauty_notes).includes(q)) return true;
  return [c.full_name, c.phone, c.email, c.skin_type, c.foundation_shade, c.city]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
};
