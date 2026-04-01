import { supabase } from "@/integrations/supabase/client";

// Customers
export const fetchCustomers = async () => {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name");
  if (error) throw error;
  return data;
};

export const fetchCustomer = async (id: string) => {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
};

export const createCustomer = async (customer: { name: string; phone?: string; email?: string; notes?: string }) => {
  const { data, error } = await supabase.from("customers").insert(customer).select().single();
  if (error) throw error;
  return data;
};

export const updateCustomer = async (id: string, customer: { name?: string; phone?: string; email?: string; notes?: string; follow_up_needed?: boolean; last_contact_date?: string | null }) => {
  const { data, error } = await supabase.from("customers").update(customer).eq("id", id).select().single();
  if (error) throw error;
  return data;
};

export const deleteCustomer = async (id: string) => {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
};

// Orders
export const fetchOrders = async (customerId?: string) => {
  let query = supabase.from("orders").select("*, customers(name), payments(id, amount)").order("order_date", { ascending: false });
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const fetchOrder = async (id: string) => {
  const { data, error } = await supabase
    .from("orders")
    .select("*, customers(name), order_items(*), payments(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
};

export const createOrder = async (order: {
  customer_id: string;
  order_date?: string;
  order_source?: "Online" | "Phone" | "Text" | "Event" | "Other";
  total_amount?: number;
  payment_status?: "Paid" | "Unpaid" | "Partial";
  payment_method?: "Cash" | "Check" | "Venmo" | "Zelle" | "Card" | "Other" | null;
  notes?: string;
}) => {
  const { data, error } = await supabase.from("orders").insert(order).select().single();
  if (error) throw error;
  return data;
};

export const updateOrder = async (id: string, updates: Record<string, unknown>) => {
  const { data, error } = await supabase.from("orders").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
};

export const deleteOrder = async (id: string) => {
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
};

// Order Items
export const createOrderItem = async (item: { order_id: string; product_name: string; quantity: number; price: number }) => {
  const { data, error } = await supabase.from("order_items").insert(item).select().single();
  if (error) throw error;
  return data;
};

export const deleteOrderItem = async (id: string) => {
  const { error } = await supabase.from("order_items").delete().eq("id", id);
  if (error) throw error;
};

// Payments
export const createPayment = async (payment: {
  order_id: string;
  amount: number;
  payment_method: "Cash" | "Check" | "Venmo" | "Zelle" | "Card";
  payment_date?: string;
  notes?: string;
}) => {
  const { data, error } = await supabase.from("payments").insert(payment).select().single();
  if (error) throw error;
  return data;
};

export const deletePayment = async (id: string) => {
  const { error } = await supabase.from("payments").delete().eq("id", id);
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
