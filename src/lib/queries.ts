import { supabase } from "@/integrations/supabase/client";
import type { Customer, Order, OrderWithCustomer, EventRecord, EventGuest, CustomerNote, Prospect, ProspectNote, Expense, Income, Note, BookingLead } from "./types";

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

export const bulkUpdateCustomerFollowUps = async (assignments: { id: string; next_follow_up_date: string }[]) => {
  for (const { id, next_follow_up_date } of assignments) {
    const { error } = await supabase
      .from("customers")
      .update({ next_follow_up_date } as any)
      .eq("id", id);
    if (error) throw error;
  }
};

export const deleteCustomer = async (id: string) => {
  // Check for order history first
  const { count, error: countError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", id);
  if (countError) throw countError;
  if (count && count > 0) {
    throw new Error("Customer cannot be deleted because they have order history. Use Archive instead.");
  }
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
};

export const archiveCustomer = async (id: string) => {
  const { error } = await supabase
    .from("customers")
    .update({ is_active: false, archived_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw error;
};

export const unarchiveCustomer = async (id: string) => {
  const { error } = await supabase
    .from("customers")
    .update({ is_active: true, archived_at: null } as any)
    .eq("id", id);
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
  wholesale_amount?: number | null;
  payout_amount?: number | null;
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

// Events
export const fetchEvents = async (): Promise<EventRecord[]> => {
  const { data, error } = await supabase.from("events").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as EventRecord[];
};

export const upsertEvent = async (event: { event_id: string; guest_count?: number; ordering_guest_count?: number; event_date?: string | null; event_type?: string | null; hostess_name?: string; notes?: string | null }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("events")
    .upsert({ ...event, owner_user_id: userId } as any, { onConflict: "event_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Event Guests
export const fetchEventGuests = async (eventId: string): Promise<EventGuest[]> => {
  const { data, error } = await supabase
    .from("event_guests")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as EventGuest[];
};

export const fetchAllEventGuests = async (): Promise<EventGuest[]> => {
  const { data, error } = await supabase
    .from("event_guests")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as EventGuest[];
};

export const createEventGuest = async (guest: { event_id: string; name: string; phone?: string | null; notes?: string | null }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("event_guests")
    .insert({ ...guest, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as EventGuest;
};

export const deleteEventGuest = async (id: string) => {
  const { error } = await supabase.from("event_guests").delete().eq("id", id);
  if (error) throw error;
};

export const convertGuestToCustomer = async (guest: EventGuest) => {
  const userId = await getCurrentUserId();
  // Create customer
  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .insert({
      full_name: guest.name,
      phone: guest.phone,
      relationship_status: "Customer",
      owner_user_id: userId,
    } as any)
    .select()
    .single();
  if (cErr) throw cErr;
  // Link guest to customer
  const { error: gErr } = await supabase
    .from("event_guests")
    .update({ converted_customer_id: customer.id } as any)
    .eq("id", guest.id);
  if (gErr) throw gErr;
  return customer;
};

export const updateEvent = async (eventId: string, updates: Partial<EventRecord>) => {
  const { data, error } = await supabase
    .from("events")
    .update(updates as any)
    .eq("event_id", eventId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Customer Notes
export const fetchCustomerNotes = async (customerId: string): Promise<CustomerNote[]> => {
  const { data, error } = await supabase
    .from("customer_notes")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as CustomerNote[];
};

export const fetchLatestNotes = async (): Promise<CustomerNote[]> => {
  const { data, error } = await supabase
    .from("customer_notes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as CustomerNote[];
};

export const createCustomerNote = async (note: { customer_id: string; note_text: string; note_type: string }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("customer_notes")
    .insert({ ...note, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteCustomerNote = async (id: string) => {
  const { error } = await supabase.from("customer_notes").delete().eq("id", id);
  if (error) throw error;
};

// Prospects

export const fetchProspects = async (): Promise<Prospect[]> => {
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Prospect[];
};

export const fetchProspect = async (id: string): Promise<Prospect> => {
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as Prospect;
};

export const createProspect = async (prospect: Partial<Prospect> & { name: string }) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("prospects")
    .insert({ ...prospect, owner_user_id: userId } as any);
  if (error) throw error;
};

export const updateProspect = async (id: string, updates: Partial<Prospect>) => {
  const { error } = await supabase
    .from("prospects")
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
};

export const deleteProspect = async (id: string) => {
  const { error } = await supabase.from("prospects").delete().eq("id", id);
  if (error) throw error;
};

// Prospect Notes

export const fetchProspectNotes = async (prospectId: string): Promise<ProspectNote[]> => {
  const { data, error } = await supabase
    .from("prospect_notes")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as ProspectNote[];
};

export const createProspectNote = async (note: { prospect_id: string; note_text: string }) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("prospect_notes")
    .insert({ ...note, owner_user_id: userId } as any);
  if (error) throw error;
};

export const deleteProspectNote = async (id: string) => {
  const { error } = await supabase.from("prospect_notes").delete().eq("id", id);
  if (error) throw error;
};

// Expenses

export const fetchExpenses = async (): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });
  if (error) throw error;
  return data as unknown as Expense[];
};

export const createExpense = async (expense: { expense_date: string; amount: number; category: string; notes?: string | null; receipt_url?: string | null }) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("expenses")
    .insert({ ...expense, owner_user_id: userId } as any);
  if (error) throw error;
};

export const updateExpense = async (id: string, updates: Partial<{ receipt_url: string | null }>) => {
  const { error } = await supabase.from("expenses").update(updates as any).eq("id", id);
  if (error) throw error;
};

export const uploadReceiptImage = async (file: File): Promise<string> => {
  const ext = file.name.split(".").pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("expense-receipts").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("expense-receipts").getPublicUrl(path);
  return data.publicUrl;
};

export const deleteExpense = async (id: string) => {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
};

// Income (commissions, bonuses, etc.)

export const fetchIncome = async (): Promise<Income[]> => {
  const { data, error } = await supabase
    .from("income")
    .select("*")
    .order("income_date", { ascending: false });
  if (error) throw error;
  return data as unknown as Income[];
};

export const createIncome = async (income: { income_date: string; amount: number; category: string; source?: string | null; notes?: string | null }) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("income")
    .insert({ ...income, owner_user_id: userId } as any);
  if (error) throw error;
};

export const deleteIncome = async (id: string) => {
  const { error } = await supabase.from("income").delete().eq("id", id);
  if (error) throw error;
};

// Unified Notes

export const fetchNotes = async (entityType: "Customer" | "Prospect", entityId: string): Promise<Note[]> => {
  const col = entityType === "Customer" ? "customer_id" : "prospect_id";
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("entity_type", entityType)
    .eq(col, entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Note[];
};

export const fetchAllLatestNotes = async (): Promise<Note[]> => {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Note[];
};

export const createNote = async (note: {
  entity_type: "Customer" | "Prospect";
  customer_id?: string | null;
  prospect_id?: string | null;
  note_body: string;
  note_type?: string;
  next_follow_up_date?: string | null;
}) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("notes")
    .insert({ ...note, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteNote = async (id: string) => {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
};

// Follow-up queue view

export const fetchFollowUpQueue = async () => {
  const { data, error } = await supabase
    .from("follow_up_queue" as any)
    .select("*");
  if (error) throw error;
  return data;
};

// Order financials view

export const fetchOrderFinancials = async () => {
  const { data, error } = await supabase
    .from("order_financials" as any)
    .select("*");
  if (error) throw error;
  return data;
};

// Customer summary view

export const fetchCustomerSummary = async () => {
  const { data, error } = await supabase
    .from("customer_summary" as any)
    .select("*");
  if (error) throw error;
  return data;
};

// Booking Leads

export const fetchBookingLeads = async (): Promise<BookingLead[]> => {
  const { data, error } = await supabase
    .from("booking_leads" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as BookingLead[];
};

export const createBookingLead = async (lead: Partial<BookingLead> & { name: string }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("booking_leads" as any)
    .insert({ ...lead, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as BookingLead;
};

export const updateBookingLead = async (id: string, updates: Partial<BookingLead>) => {
  const { error } = await supabase
    .from("booking_leads" as any)
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
};

export const deleteBookingLead = async (id: string) => {
  const { error } = await supabase
    .from("booking_leads" as any)
    .delete()
    .eq("id", id);
  if (error) throw error;
};

export const convertBookingLeadToCustomer = async (lead: BookingLead) => {
  const userId = await getCurrentUserId();
  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .insert({
      full_name: lead.name,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
      relationship_status: "Customer",
      owner_user_id: userId,
    } as any)
    .select()
    .single();
  if (cErr) throw cErr;
  // Link lead to customer
  const { error: uErr } = await supabase
    .from("booking_leads" as any)
    .update({ converted_customer_id: customer.id, status: "Booked" } as any)
    .eq("id", lead.id);
  if (uErr) throw uErr;
  return customer;
};
