import { supabase } from "@/integrations/supabase/client";
import type { Customer, Order, OrderWithCustomer } from "./types";

// Helper to get current user id for ownership
const getCurrentUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
};

// Customers
export const fetchCustomers = async (): Promise<Customer[]> => {
  const { data, error } = await supabase.from("customers").select("*").order("full_name");
  if (error) throw error;
  return data as unknown as Customer[];
};

export const fetchCustomer = async (id: string): Promise<Customer> => {
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
  if (error) throw error;
  return data as unknown as Customer;
};

export const createCustomer = async (customer: Partial<Customer> & { full_name: string }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("customers").insert({ ...customer, owner_user_id: userId } as any).select().single();
  if (error) throw error;
  return data;
};

export const updateCustomer = async (id: string, updates: Partial<Customer>) => {
  const { data, error } = await supabase.from("customers").update(updates as any).eq("id", id).select().single();
  if (error) throw error;
  return data;
};

export const deleteCustomer = async (id: string) => {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
};

// Orders
export const fetchOrders = async (customerId?: string): Promise<OrderWithCustomer[]> => {
  let query = supabase.from("orders").select("*, customers(full_name)").order("order_date", { ascending: false });
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as OrderWithCustomer[];
};

export const fetchCustomerOrders = async (customerId: string): Promise<Order[]> => {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false });
  if (error) throw error;
  return data as unknown as Order[];
};

export const fetchOrder = async (id: string) => {
  const { data, error } = await supabase
    .from("orders")
    .select("*, customers(full_name)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as OrderWithCustomer;
};

export const createOrder = async (order: {
  customer_id: string;
  customer_name?: string;
  order_date?: string;
  event_id?: string;
  order_type?: string;
  face_type?: string;
  hostess?: boolean;
  half_price_deal?: boolean;
  birthday?: boolean;
  referral?: boolean;
  payment_type?: string | null;
  retail_amount?: number;
  notes?: string;
  parent_event_id?: string | null;
}) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("orders").insert({ ...order, owner_user_id: userId } as any).select().single();
  if (error) throw error;
  return data;
};

export const updateOrder = async (id: string, updates: Record<string, unknown>) => {
  const { data, error } = await supabase.from("orders").update(updates as any).eq("id", id).select().single();
  if (error) throw error;
  return data;
};

export const deleteOrder = async (id: string) => {
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
};

// Products
export const fetchProducts = async () => {
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) throw error;
  return data;
};

export const createProduct = async (product: { name: string; current_stock: number; price: number }) => {
  const { data, error } = await supabase.from("products").insert(product).select().single();
  if (error) throw error;
  return data;
};

export const updateProduct = async (id: string, updates: { name?: string; current_stock?: number; price?: number }) => {
  const { data, error } = await supabase.from("products").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
};

export const deleteProduct = async (id: string) => {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
};
