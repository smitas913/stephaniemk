import { supabase } from "@/integrations/supabase/client";
import type { Customer, Order, OrderWithCustomer, EventRecord, EventGuest, CustomerNote, Prospect, ProspectNote, Expense, Income, Note, BookingLead, TeamConsultant, LeadershipMember, PaymentStatus } from "./types";
import { toLocalDateKey as toLocalDateKeyImport } from "./dateOnly";

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
  payment_status?: PaymentStatus;
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

export const upsertEvent = async (event: Partial<EventRecord> & { event_id: string }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("events")
    .upsert({ ...event, owner_user_id: userId } as any, { onConflict: "event_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateEventGuest = async (id: string, updates: Partial<EventGuest>) => {
  const { data, error } = await supabase
    .from("event_guests")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as EventGuest;
};

export const deleteEvent = async (eventId: string) => {
  // Unlink orders that reference this event
  const { error: oErr1 } = await supabase
    .from("orders")
    .update({ event_id: null } as any)
    .eq("event_id", eventId);
  if (oErr1) throw oErr1;

  const { error: oErr2 } = await supabase
    .from("orders")
    .update({ parent_event_id: null } as any)
    .eq("parent_event_id", eventId);
  if (oErr2) throw oErr2;

  // Delete event guests (they belong to the event)
  const { error: gErr } = await supabase
    .from("event_guests")
    .delete()
    .eq("event_id", eventId);
  if (gErr) throw gErr;

  // Delete event workflow tasks
  const { error: tErr } = await supabase
    .from("event_tasks" as any)
    .delete()
    .eq("event_id", eventId);
  if (tErr) throw tErr;

  // Delete the event itself
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("event_id", eventId);
  if (error) throw error;
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

export const createExpense = async (expense: { expense_date: string; amount: number; category: string; notes?: string | null; receipt_url?: string | null; event_type?: string | null; event_year?: number | null }) => {
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

export const convertBookingLeadToCustomer = async (lead: BookingLead, existingEventIds: string[] = []) => {
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

  // Mark lead as converted (Booked)
  const { error: uErr } = await supabase
    .from("booking_leads" as any)
    .update({ converted_customer_id: customer.id, status: "Booked" } as any)
    .eq("id", lead.id);
  if (uErr) throw uErr;

  // Auto-create an event for the booking
  const { generateEventId } = await import("./eventId");
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const eventType = "Party"; // default type, editable on event detail
  const eventId = generateEventId(eventType, dateStr, lead.name, existingEventIds);
  const { error: evErr } = await supabase
    .from("events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      event_date: null, // date TBD, user sets on event page
      hostess_name: lead.name,
      guest_count: 0,
      owner_user_id: userId,
      notes: lead.notes ? `Converted from booking lead. ${lead.notes}` : "Converted from booking lead.",
    } as any);
  if (evErr) throw evErr;

  return { customer, eventId };
};

// Team Consultants
export const fetchTeamConsultants = async (): Promise<TeamConsultant[]> => {
  const { data, error } = await supabase.from("team_consultants").select("*").order("name");
  if (error) throw error;
  return data as unknown as TeamConsultant[];
};

export const createTeamConsultant = async (consultant: Partial<TeamConsultant> & { name: string }): Promise<TeamConsultant> => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("team_consultants").insert({ ...consultant, owner_user_id: userId } as any).select().single();
  if (error) throw error;
  return data as unknown as TeamConsultant;
};

export const updateTeamConsultant = async (id: string, updates: Partial<TeamConsultant>): Promise<void> => {
  const { error } = await supabase.from("team_consultants").update(updates as any).eq("id", id);
  if (error) throw error;
};

export const deleteTeamConsultant = async (id: string): Promise<void> => {
  const { error } = await supabase.from("team_consultants").delete().eq("id", id);
  if (error) throw error;
};

// Leadership Members
export const fetchLeadershipMembers = async (): Promise<LeadershipMember[]> => {
  const { data, error } = await supabase.from("leadership_members").select("*").order("name");
  if (error) throw error;
  return data as unknown as LeadershipMember[];
};

export const createLeadershipMember = async (member: Partial<LeadershipMember> & { name: string }): Promise<LeadershipMember> => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from("leadership_members").insert({ ...member, owner_user_id: userId } as any).select().single();
  if (error) throw error;
  return data as unknown as LeadershipMember;
};

export const updateLeadershipMember = async (id: string, updates: Partial<LeadershipMember>): Promise<void> => {
  const { error } = await supabase.from("leadership_members").update(updates as any).eq("id", id);
  if (error) throw error;
};

export const deleteLeadershipMember = async (id: string): Promise<void> => {
  const { error } = await supabase.from("leadership_members").delete().eq("id", id);
  if (error) throw error;
};

// Convert prospect to team consultant
// Event Tasks

export interface EventTask {
  id: string;
  event_id: string;
  task_name: string;
  task_type: string;
  due_date: string | null;
  is_completed: boolean;
  completed_at: string | null;
  owner_user_id: string | null;
  created_at: string;
}

export const fetchEventTasks = async (): Promise<EventTask[]> => {
  const { data, error } = await supabase
    .from("event_tasks" as any)
    .select("*")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data as unknown as EventTask[];
};

export const fetchEventTasksByEventId = async (eventId: string): Promise<EventTask[]> => {
  const { data, error } = await supabase
    .from("event_tasks" as any)
    .select("*")
    .eq("event_id", eventId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data as unknown as EventTask[];
};

export const createEventTask = async (task: { event_id: string; task_name: string; task_type: string; due_date?: string | null }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("event_tasks" as any)
    .insert({ ...task, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as EventTask;
};

export const updateEventTask = async (id: string, updates: Partial<EventTask>) => {
  const { error } = await supabase
    .from("event_tasks" as any)
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
};

export const completeEventTask = async (id: string) => {
  const { error } = await supabase
    .from("event_tasks" as any)
    .update({ is_completed: true, completed_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw error;
};

export const deleteEventTasksByEventId = async (eventId: string) => {
  const { error } = await supabase
    .from("event_tasks" as any)
    .delete()
    .eq("event_id", eventId);
  if (error) throw error;
};

/** Generate the standard workflow tasks for a new event */
export const generateEventWorkflowTasks = async (eventId: string, eventDate: string | null) => {
  const userId = await getCurrentUserId();
  const today = toLocalDateKeyImport();

  // Task 1: Send Hostess Form — due immediately (today)
  const tasks: Array<{ event_id: string; task_name: string; task_type: string; due_date: string | null; owner_user_id: string | null }> = [
    { event_id: eventId, task_name: "Send Hostess Form", task_type: "hostess_form", due_date: today, owner_user_id: userId },
  ];

  // Pre-event tasks (only if event_date is set)
  if (eventDate) {
    const ed = new Date(eventDate + "T12:00:00");
    const fiveBefore = new Date(ed); fiveBefore.setDate(ed.getDate() - 5);
    const twoBefore = new Date(ed); twoBefore.setDate(ed.getDate() - 2);
    const oneBefore = new Date(ed); oneBefore.setDate(ed.getDate() - 1);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    tasks.push(
      { event_id: eventId, task_name: "Hostess Pre-Profile + Guest Review", task_type: "pre_profile", due_date: fmt(fiveBefore), owner_user_id: userId },
      { event_id: eventId, task_name: "Guest Hype Text (Goody Bag)", task_type: "guest_hype", due_date: fmt(twoBefore), owner_user_id: userId },
      { event_id: eventId, task_name: "Final Guest Confirmation", task_type: "final_confirmation", due_date: fmt(oneBefore), owner_user_id: userId },
    );
  }

  const { error } = await supabase
    .from("event_tasks" as any)
    .insert(tasks as any);
  if (error) throw error;
};

/** Trigger task when hostess form is completed */
export const generateGuestInviteTask = async (eventId: string) => {
  const userId = await getCurrentUserId();
  const today = toLocalDateKeyImport();
  // Check if already exists
  const { data: existing } = await supabase
    .from("event_tasks" as any)
    .select("id")
    .eq("event_id", eventId)
    .eq("task_type", "guest_invite");
  if (existing && existing.length > 0) return; // already exists

  const { error } = await supabase
    .from("event_tasks" as any)
    .insert({ event_id: eventId, task_name: "Send Guest Invite + Guest Form", task_type: "guest_invite", due_date: today, owner_user_id: userId } as any);
  if (error) throw error;
};

export const convertProspectToConsultant = async (
  prospect: Prospect,
  extras?: { next_coaching_date?: string | null; coaching_focus?: string | null }
): Promise<TeamConsultant> => {
  const userId = await getCurrentUserId();
  const { data: consultant, error: cErr } = await supabase.from("team_consultants").insert({
    name: prospect.name,
    phone: prospect.phone,
    email: prospect.email,
    prospect_id: prospect.id,
    join_date: new Date().toISOString().split("T")[0],
    status: "Active",
    focus_group: "New Consultant",
    onboarding_stage: "New",
    coaching_focus: extras?.coaching_focus || null,
    next_coaching_date: extras?.next_coaching_date || null,
    notes: prospect.notes ? `Converted from prospect. ${prospect.notes}` : "Converted from prospect.",
    owner_user_id: userId,
  } as any).select().single();
  if (cErr) throw cErr;

  await supabase.from("prospects").update({ opportunity_status: "Converted" } as any).eq("id", prospect.id);

  if (prospect.customer_id) {
    await supabase.from("customers").update({ relationship_status: "Consultant" } as any).eq("id", prospect.customer_id);
  }

  return consultant as unknown as TeamConsultant;
};
