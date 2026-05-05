import { supabase } from "@/integrations/supabase/client";
import type {
  Customer,
  Order,
  OrderWithCustomer,
  EventRecord,
  EventGuest,
  CustomerNote,
  Prospect,
  ProspectNote,
  Expense,
  Income,
  Note,
  BookingLead,
  TeamConsultant,
  LeadershipMember,
  PaymentStatus,
} from "./types";
import { toLocalDateKey as toLocalDateKeyImport } from "./dateOnly";
import {
  nextAvailableWeekday,
  nextAvailableDay,
  spreadTasks,
  buildWorkdayFlags,
  type OOOPeriod,
} from "./smartSchedule";
import { normalizePhoneForStorage, stripPhone, normalizeEmail } from "./phoneUtils";

// Helper to get current user id for ownership
const getCurrentUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
};

/** Apply phone normalization to any payload that has a `phone` (and optional `secondary_phone`) field. */
function withNormalizedPhone<T extends Record<string, any>>(payload: T): T {
  const next: any = { ...payload };
  if ("phone" in next) next.phone = normalizePhoneForStorage(next.phone);
  if ("secondary_phone" in next) next.secondary_phone = normalizePhoneForStorage(next.secondary_phone);
  if ("hostess_phone" in next) next.hostess_phone = normalizePhoneForStorage(next.hostess_phone);
  return next as T;
}

/**
 * Search customers + consultants for an existing record with a matching
 * normalized phone or email. Returns the first match, or null.
 */
export async function findDuplicatePerson(opts: {
  phone?: string | null;
  email?: string | null;
  excludeCustomerId?: string;
  excludeConsultantId?: string;
}): Promise<
  | { kind: "customer"; id: string; name: string; phone: string | null; email: string | null }
  | { kind: "consultant"; id: string; name: string; phone: string | null; email: string | null }
  | null
> {
  const phoneDigits = stripPhone(opts.phone);
  const emailNorm = normalizeEmail(opts.email);
  if (!phoneDigits && !emailNorm) return null;

  // Customers
  const { data: customers } = await supabase.from("customers").select("id, full_name, phone, email").limit(1000);
  for (const c of customers || []) {
    if (opts.excludeCustomerId && c.id === opts.excludeCustomerId) continue;
    const cp = stripPhone((c as any).phone);
    const ce = normalizeEmail((c as any).email);
    if (phoneDigits && cp && phoneDigits.length >= 7 && cp === phoneDigits) {
      return {
        kind: "customer",
        id: c.id,
        name: (c as any).full_name,
        phone: (c as any).phone,
        email: (c as any).email,
      };
    }
    if (emailNorm && ce && ce === emailNorm) {
      return {
        kind: "customer",
        id: c.id,
        name: (c as any).full_name,
        phone: (c as any).phone,
        email: (c as any).email,
      };
    }
  }

  // Consultants
  const { data: consultants } = await supabase.from("team_consultants").select("id, name, phone, email").limit(1000);
  for (const c of consultants || []) {
    if (opts.excludeConsultantId && c.id === opts.excludeConsultantId) continue;
    const cp = stripPhone((c as any).phone);
    const ce = normalizeEmail((c as any).email);
    if (phoneDigits && cp && phoneDigits.length >= 7 && cp === phoneDigits) {
      return { kind: "consultant", id: c.id, name: (c as any).name, phone: (c as any).phone, email: (c as any).email };
    }
    if (emailNorm && ce && ce === emailNorm) {
      return { kind: "consultant", id: c.id, name: (c as any).name, phone: (c as any).phone, email: (c as any).email };
    }
  }
  return null;
}

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
  // Always default date_added to the user's LOCAL today (not Postgres CURRENT_DATE which is UTC).
  const { toLocalDateKey } = await import("@/lib/dateOnly");
  const payload: any = withNormalizedPhone({ ...customer, owner_user_id: userId });
  if (!payload.date_added) payload.date_added = toLocalDateKey();
  const { data, error } = await supabase.from("customers").insert(payload).select().single();
  if (error) throw error;
  return data;
};

export const updateCustomer = async (id: string, updates: Partial<Customer>) => {
  const payload: any = withNormalizedPhone(updates);
  const { data, error } = await supabase.from("customers").update(payload).eq("id", id).select().single();
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

// Flag / unflag a customer for follow-through
export const flagCustomer = async (id: string, reason: string) => {
  const { error } = await supabase
    .from("customers")
    .update({ needs_attention: true, attention_reason: reason, flagged_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw error;
};

export const unflagCustomer = async (id: string) => {
  const { error } = await supabase
    .from("customers")
    .update({ needs_attention: false, attention_reason: null, flagged_at: null } as any)
    .eq("id", id);
  if (error) throw error;
};

// User preferences (weekly reset day, banner dismissals)
export type UserPreferences = {
  id: string;
  user_id: string;
  weekly_reset_day: number; // 0=Sun..6=Sat
  weekly_reset_last_dismissed: string | null;
};

export const fetchUserPreferences = async (): Promise<UserPreferences | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("user_preferences" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
};

export const upsertUserPreferences = async (updates: Partial<Omit<UserPreferences, "id" | "user_id">>) => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("user_preferences" as any)
    .upsert({ user_id: userId, ...updates } as any, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data as any;
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
  const { data, error } = await supabase.from("orders").select("*, customers(full_name)").eq("id", id).single();
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
  discount_amount?: number;
  tax_amount?: number;
  cc_fee_amount?: number;
  cc_transaction_type?: string | null;
  net_received?: number | null;
  net_profit?: number | null;
  notes?: string;
  parent_event_id?: string | null;
  is_myshop_order?: boolean;
}) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orders")
    .insert({ ...order, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateOrder = async (id: string, updates: Record<string, unknown>) => {
  const { data, error } = await supabase
    .from("orders")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();
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

  // Auto-progress matching booking lead → Booked when an event is scheduled.
  if (event.hostess_name) {
    const { autoProgressLeadFromEvent } = await import("./leadAutoStatus");
    await autoProgressLeadFromEvent({ hostessName: event.hostess_name as string });
  }
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
  const { error: gErr } = await supabase.from("event_guests").delete().eq("event_id", eventId);
  if (gErr) throw gErr;

  // Delete event workflow tasks
  const { error: tErr } = await supabase
    .from("event_tasks" as any)
    .delete()
    .eq("event_id", eventId);
  if (tErr) throw tErr;

  // Delete the event itself
  const { error } = await supabase.from("events").delete().eq("event_id", eventId);
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
  const { data, error } = await supabase.from("event_guests").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as EventGuest[];
};

export const createEventGuest = async (guest: {
  event_id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
}) => {
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
  const { error: gErr } = await supabase
    .from("event_guests")
    .update({ converted_customer_id: customer.id } as any)
    .eq("id", guest.id);
  if (gErr) throw gErr;
  return customer;
};

export const convertHostessToCustomer = async (event: EventRecord) => {
  const userId = await getCurrentUserId();
  // Check if already a customer by name + phone to avoid duplicates
  if (event.hostess_phone) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id, full_name")
      .eq("phone", event.hostess_phone)
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (existing) {
      // Already exists — just link and return
      await supabase
        .from("events")
        .update({ hostess_converted_customer_id: existing.id } as any)
        .eq("event_id", event.event_id);
      return existing;
    }
  }
  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .insert({
      full_name: event.hostess_name,
      phone: event.hostess_phone || null,
      email: event.hostess_email || null,
      relationship_status: "Customer",
      owner_user_id: userId,
      source: `Hostess — ${event.event_type || "Event"} on ${event.event_date || ""}`,
    } as any)
    .select()
    .single();
  if (cErr) throw cErr;
  // Store link back on event so button shows converted state
  await supabase
    .from("events")
    .update({ hostess_converted_customer_id: customer.id } as any)
    .eq("event_id", event.event_id);
  return customer;
};

export const updateEvent = async (eventId: string, updates: Partial<EventRecord>) => {
  const { error } = await supabase
    .from("events")
    .update(updates as any)
    .eq("id", eventId);
  if (error) throw error;
  return { success: true, event_id: eventId };
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
  const { data, error } = await supabase.from("customer_notes").select("*").order("created_at", { ascending: false });
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
  // Look up customer_id first so we can rebuild parent state after deletion.
  const { data: row } = await supabase.from("customer_notes").select("customer_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("customer_notes").delete().eq("id", id);
  if (error) throw error;
  const customerId = (row as any)?.customer_id;
  if (customerId) {
    // Reuse the same rollback as unified notes — recomputes last_contacted /
    // next_follow_up_date from any remaining notes for this customer.
    await rollbackCustomerStateFromNotes(customerId);
  }
};

// Prospects

export const fetchProspects = async (): Promise<Prospect[]> => {
  const { data, error } = await supabase.from("prospects").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Prospect[];
};

export const fetchProspect = async (id: string): Promise<Prospect> => {
  const { data, error } = await supabase.from("prospects").select("*").eq("id", id).single();
  if (error) throw error;
  return data as unknown as Prospect;
};

export const createProspect = async (prospect: Partial<Prospect> & { name: string }) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("prospects")
    .insert(withNormalizedPhone({ ...prospect, owner_user_id: userId }) as any);
  if (error) throw error;
};

export const updateProspect = async (id: string, updates: Partial<Prospect>) => {
  const { error } = await supabase
    .from("prospects")
    .update(withNormalizedPhone(updates) as any)
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
  const { error } = await supabase.from("prospect_notes").insert({ ...note, owner_user_id: userId } as any);
  if (error) throw error;
};

export const deleteProspectNote = async (id: string) => {
  const { error } = await supabase.from("prospect_notes").delete().eq("id", id);
  if (error) throw error;
};

// Expenses

export const fetchExpenses = async (): Promise<Expense[]> => {
  const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
  if (error) throw error;
  return data as unknown as Expense[];
};

export const createExpense = async (expense: {
  expense_date: string;
  amount: number;
  category: string;
  notes?: string | null;
  receipt_url?: string | null;
  event_type?: string | null;
  event_year?: number | null;
}) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("expenses").insert({ ...expense, owner_user_id: userId } as any);
  if (error) throw error;
};

export const updateExpense = async (id: string, updates: Partial<{ receipt_url: string | null }>) => {
  const { error } = await supabase
    .from("expenses")
    .update(updates as any)
    .eq("id", id);
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
  const { data, error } = await supabase.from("income").select("*").order("income_date", { ascending: false });
  if (error) throw error;
  return data as unknown as Income[];
};

export const createIncome = async (income: {
  income_date: string;
  amount: number;
  category: string;
  source?: string | null;
  notes?: string | null;
}) => {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("income").insert({ ...income, owner_user_id: userId } as any);
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
  const unified = (data || []) as unknown as Note[];

  // Merge legacy customer_notes so older history isn't lost. We surface any
  // legacy row that doesn't already appear in the unified `notes` table
  // (matched by body + date) to avoid duplicates from the Skip mirror writes.
  if (entityType === "Customer") {
    const { data: legacy, error: legacyErr } = await supabase
      .from("customer_notes")
      .select("*")
      .eq("customer_id", entityId)
      .order("created_at", { ascending: false });
    if (legacyErr) throw legacyErr;
    const seen = new Set(unified.map((n) => `${(n.note_body || "").trim()}|${(n.note_date || "").slice(0, 10)}`));
    const legacyMapped: Note[] = ((legacy || []) as any[])
      .filter((l) => {
        const key = `${(l.note_text || "").trim()}|${(l.created_at || "").slice(0, 10)}`;
        return !seen.has(key);
      })
      .map((l) => ({
        id: l.id,
        entity_type: "Customer",
        customer_id: l.customer_id,
        prospect_id: null,
        person_id: l.customer_id,
        person_type: "customer",
        note_body: l.note_text,
        note_type: l.note_type || "Note",
        note_date: (l.created_at || "").slice(0, 10),
        next_follow_up_date: null,
        is_booking_attempt: false,
        is_follow_up: false,
        result_type: null,
        tags: ["legacy"],
        owner_user_id: l.owner_user_id,
        created_at: l.created_at,
      })) as unknown as Note[];

    const merged = [...unified, ...legacyMapped];
    merged.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
    return merged;
  }
  return unified;
};

export const fetchAllLatestNotes = async (): Promise<Note[]> => {
  const { data, error } = await supabase.from("notes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Note[];
};

export const createNote = async (note: {
  entity_type: "Customer" | "Prospect" | "Lead" | "Consultant" | "Hostess";
  customer_id?: string | null;
  prospect_id?: string | null;
  person_type?: "customer" | "prospect" | "lead" | "consultant" | "hostess" | null;
  person_id?: string | null;
  tags?: string[];
  note_body: string;
  note_type?: string;
  note_date?: string | null;
  next_step?: string | null;
  next_follow_up_date?: string | null;
  is_booking_attempt?: boolean;
  is_follow_up?: boolean;
  result_type?: "Face" | "Career Chat" | "Booking Conversation" | null;
}) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("notes")
    .insert({ ...note, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;

  // Auto-progress booking lead status based on logged activity.
  if (note.entity_type === "Lead" && note.person_id) {
    const { autoProgressLeadFromNote } = await import("./leadAutoStatus");
    // tags array contains a category tag like "Booking" or "Follow-Up"
    const category =
      (note.tags || []).find((t) => ["Booking", "Coaching", "Recruiting", "Team Building", "Follow-Up"].includes(t)) ||
      null;
    await autoProgressLeadFromNote({
      leadId: note.person_id,
      actionType: note.note_type || null,
      category,
      isBookingAttempt: note.is_booking_attempt ?? false,
      noteType: note.note_type || null,
    });
  }
  return data;
};

// Momentum Goals
export type MomentumPeriod = "weekly" | "monthly";
export interface MomentumGoal {
  id: string;
  user_id: string;
  metric_key: string;
  metric_label: string;
  period: MomentumPeriod;
  goal_value: number;
  is_visible: boolean;
  sort_order: number;
}

export const DEFAULT_MOMENTUM_GOALS: Omit<MomentumGoal, "id" | "user_id">[] = [
  // Weekly
  { metric_key: "faces", metric_label: "Faces", period: "weekly", goal_value: 10, is_visible: true, sort_order: 1 },
  {
    metric_key: "career_chats",
    metric_label: "Career Chats",
    period: "weekly",
    goal_value: 5,
    is_visible: true,
    sort_order: 2,
  },
  {
    metric_key: "booking_conversations",
    metric_label: "Booking Conversations",
    period: "weekly",
    goal_value: 5,
    is_visible: true,
    sort_order: 3,
  },
  {
    metric_key: "appointments_held",
    metric_label: "Appointments Held",
    period: "weekly",
    goal_value: 3,
    is_visible: true,
    sort_order: 4,
  },
  {
    metric_key: "new_bookings",
    metric_label: "New Bookings",
    period: "weekly",
    goal_value: 2,
    is_visible: true,
    sort_order: 5,
  },
  {
    metric_key: "follow_ups",
    metric_label: "Follow-ups Completed",
    period: "weekly",
    goal_value: 15,
    is_visible: true,
    sort_order: 6,
  },
  // Monthly
  { metric_key: "faces", metric_label: "Faces", period: "monthly", goal_value: 40, is_visible: true, sort_order: 1 },
  {
    metric_key: "career_chats",
    metric_label: "Career Chats",
    period: "monthly",
    goal_value: 20,
    is_visible: true,
    sort_order: 2,
  },
  {
    metric_key: "booking_conversations",
    metric_label: "Booking Conversations",
    period: "monthly",
    goal_value: 20,
    is_visible: true,
    sort_order: 3,
  },
  {
    metric_key: "appointments_held",
    metric_label: "Appointments Held",
    period: "monthly",
    goal_value: 12,
    is_visible: true,
    sort_order: 4,
  },
  {
    metric_key: "new_bookings",
    metric_label: "New Bookings",
    period: "monthly",
    goal_value: 8,
    is_visible: true,
    sort_order: 5,
  },
  {
    metric_key: "follow_ups",
    metric_label: "Follow-ups Completed",
    period: "monthly",
    goal_value: 60,
    is_visible: true,
    sort_order: 6,
  },
  {
    metric_key: "new_customers",
    metric_label: "New Customers",
    period: "monthly",
    goal_value: 5,
    is_visible: true,
    sort_order: 7,
  },
  {
    metric_key: "new_team_members",
    metric_label: "New Personal Team Members",
    period: "monthly",
    goal_value: 1,
    is_visible: true,
    sort_order: 8,
  },
];

export const fetchMomentumGoals = async (): Promise<MomentumGoal[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("momentum_goals")
    .select("*")
    .eq("user_id", userId)
    .order("period")
    .order("sort_order");
  if (error) throw error;

  const existing = (data || []) as unknown as MomentumGoal[];
  // Seed defaults for any missing metric_key/period combos
  const have = new Set(existing.map((g) => `${g.period}:${g.metric_key}`));
  const missing = DEFAULT_MOMENTUM_GOALS.filter((d) => !have.has(`${d.period}:${d.metric_key}`));
  if (missing.length > 0) {
    const rows = missing.map((d) => ({ ...d, user_id: userId }));
    const { data: inserted, error: insErr } = await supabase
      .from("momentum_goals")
      .insert(rows as any)
      .select();
    if (insErr) throw insErr;
    return [...existing, ...((inserted as unknown as MomentumGoal[]) || [])].sort(
      (a, b) => a.period.localeCompare(b.period) || a.sort_order - b.sort_order,
    );
  }
  return existing;
};

export const updateMomentumGoal = async (
  id: string,
  updates: Partial<Pick<MomentumGoal, "goal_value" | "is_visible">>,
) => {
  const { error } = await supabase
    .from("momentum_goals")
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
};

// Business Growth Goals (Production / Unit Size / etc.)
export interface BusinessGoal {
  id: string;
  user_id: string;
  metric_key: string;
  metric_label: string;
  period: MomentumPeriod;
  goal_value: number;
  manual_actual: number | null;
  auto_track_key: string | null;
  unit: "count" | "currency";
  is_visible: boolean;
  sort_order: number;
}

export const DEFAULT_BUSINESS_GOALS: Omit<BusinessGoal, "id" | "user_id">[] = [
  // Goal values seed at 0 — no hidden defaults. Users set their own targets in Business Goals.
  {
    metric_key: "production",
    metric_label: "Production",
    period: "weekly",
    goal_value: 0,
    manual_actual: null,
    auto_track_key: null,
    unit: "currency",
    is_visible: true,
    sort_order: 1,
  },
  {
    metric_key: "unit_size",
    metric_label: "Unit Size",
    period: "weekly",
    goal_value: 0,
    manual_actual: null,
    auto_track_key: "consultant_count",
    unit: "count",
    is_visible: true,
    sort_order: 2,
  },
  {
    metric_key: "production",
    metric_label: "Production",
    period: "monthly",
    goal_value: 0,
    manual_actual: null,
    auto_track_key: null,
    unit: "currency",
    is_visible: true,
    sort_order: 1,
  },
  {
    metric_key: "unit_size",
    metric_label: "Unit Size",
    period: "monthly",
    goal_value: 0,
    manual_actual: null,
    auto_track_key: "consultant_count",
    unit: "count",
    is_visible: true,
    sort_order: 2,
  },
  // Sales Goals (monthly): baseline = "production" above (kept for back-compat).
  // Stretch + optional Profit goal added so directors can track upside + profit.
  {
    metric_key: "sales_stretch",
    metric_label: "Monthly Stretch Sales",
    period: "monthly",
    goal_value: 0,
    manual_actual: null,
    auto_track_key: null,
    unit: "currency",
    is_visible: true,
    sort_order: 3,
  },
  {
    metric_key: "profit_goal",
    metric_label: "Monthly Profit Goal (optional)",
    period: "monthly",
    goal_value: 0,
    manual_actual: null,
    auto_track_key: null,
    unit: "currency",
    is_visible: true,
    sort_order: 4,
  },
];

export const fetchBusinessGoals = async (): Promise<BusinessGoal[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("business_goals" as any)
    .select("*")
    .eq("user_id", userId)
    .order("period")
    .order("sort_order");
  if (error) throw error;
  const existing = (data || []) as unknown as BusinessGoal[];
  const have = new Set(existing.map((g) => `${g.period}:${g.metric_key}`));
  const missing = DEFAULT_BUSINESS_GOALS.filter((d) => !have.has(`${d.period}:${d.metric_key}`));
  if (missing.length > 0) {
    const rows = missing.map((d) => ({ ...d, user_id: userId }));
    const { data: inserted, error: insErr } = await supabase
      .from("business_goals" as any)
      .insert(rows as any)
      .select();
    if (insErr) throw insErr;
    return [...existing, ...((inserted as unknown as BusinessGoal[]) || [])].sort(
      (a, b) => a.period.localeCompare(b.period) || a.sort_order - b.sort_order,
    );
  }
  return existing;
};

export const updateBusinessGoal = async (
  id: string,
  updates: Partial<Pick<BusinessGoal, "goal_value" | "manual_actual" | "is_visible">>,
) => {
  const { error } = await supabase
    .from("business_goals" as any)
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
};

/**
 * Fully delete a note and roll back its side-effects:
 *  - Remove any duplicated legacy customer_notes mirror (same body + date).
 *  - Recompute the parent customer/prospect's last_contacted and
 *    next_follow_up_date from the remaining notes.
 *  - For Lead notes, recompute the lead's status from remaining outreach
 *    activity (Working ↔ New). Booked is preserved (event-driven).
 */
export const deleteNote = async (id: string) => {
  // 1. Fetch the note we're about to delete so we can roll back its effects.
  const { data: noteRow } = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
  const note = noteRow as any;

  // 2. Cascade-remove any legacy customer_notes mirror so the row doesn't
  //    "come back" via the dedup merge in fetchNotes.
  if (note?.entity_type === "Customer" && note?.customer_id) {
    const dateKey = (note.note_date || "").slice(0, 10);
    const body = (note.note_body || "").trim();
    if (dateKey && body) {
      const { data: mirrors } = await supabase
        .from("customer_notes")
        .select("id, note_text, created_at")
        .eq("customer_id", note.customer_id);
      for (const m of (mirrors as any[]) || []) {
        if ((m.note_text || "").trim() === body && (m.created_at || "").slice(0, 10) === dateKey) {
          await supabase.from("customer_notes").delete().eq("id", m.id);
        }
      }
    }
  }

  // 3. Delete the note itself.
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;

  // 4. Roll back parent entity state from remaining notes.
  if (note?.entity_type === "Customer" && note?.customer_id) {
    await rollbackCustomerStateFromNotes(note.customer_id);
  } else if (note?.entity_type === "Prospect" && note?.prospect_id) {
    await rollbackProspectStateFromNotes(note.prospect_id);
  }

  // 5. Lead status rollback.
  if (note?.entity_type === "Lead" && note?.person_id) {
    await rollbackLeadStatusFromNotes(note.person_id);
  }
};

const OUTREACH_NOTE_TYPES_SET = new Set(["Call", "Text", "Email", "In Person"]);

async function rollbackCustomerStateFromNotes(customerId: string) {
  // Pull all remaining notes (unified) for this customer.
  const { data: remaining } = await supabase
    .from("notes")
    .select("note_date, next_follow_up_date, note_type, created_at")
    .eq("entity_type", "Customer")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  const rows = (remaining as any[]) || [];

  // last_contacted = max note_date of non-dismissal note, else null.
  const isDismissal = (t: string) => t === "Skipped" || t === "No Follow-Up Needed";
  const contactDates = rows
    .filter((r) => !isDismissal(r.note_type))
    .map((r) => (r.note_date || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const newLastContacted = contactDates.length ? contactDates[contactDates.length - 1] : null;

  // next_follow_up_date = soonest future follow_up date from remaining notes
  // (>= today), else null. Conservative: clear if nothing scheduled remains.
  const todayKey = new Date().toISOString().slice(0, 10);
  const futureFollowUps = rows
    .map((r) => (r.next_follow_up_date || "").slice(0, 10))
    .filter((d) => d && d >= todayKey)
    .sort();
  const newNextFollowUp = futureFollowUps[0] || null;

  await supabase
    .from("customers")
    .update({
      last_contacted: newLastContacted,
      next_follow_up_date: newNextFollowUp,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", customerId);
}

async function rollbackProspectStateFromNotes(prospectId: string) {
  const { data: remaining } = await supabase
    .from("notes")
    .select("note_date, next_follow_up_date, note_type")
    .eq("entity_type", "Prospect")
    .eq("prospect_id", prospectId);
  const rows = (remaining as any[]) || [];
  const isDismissal = (t: string) => t === "Skipped" || t === "No Follow-Up Needed";
  const contactDates = rows
    .filter((r) => !isDismissal(r.note_type))
    .map((r) => (r.note_date || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const todayKey = new Date().toISOString().slice(0, 10);
  const futureFollowUps = rows
    .map((r) => (r.next_follow_up_date || "").slice(0, 10))
    .filter((d) => d && d >= todayKey)
    .sort();
  await supabase
    .from("prospects")
    .update({
      last_contact_date: contactDates.length ? contactDates[contactDates.length - 1] : null,
      next_follow_up_date: futureFollowUps[0] || null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", prospectId);
}

async function rollbackLeadStatusFromNotes(leadId: string) {
  const { data: lead } = await supabase
    .from("booking_leads" as any)
    .select("status, last_contact_date, next_follow_up_date")
    .eq("id", leadId)
    .maybeSingle();
  const current = (lead as any)?.status;
  // Never auto-revive DNC; never demote Booked (event-driven).
  if (!current || current === "Not Interested" || current === "Booked") {
    // Still recompute last_contact_date / next_follow_up_date below.
  }

  const { data: remaining } = await supabase
    .from("notes")
    .select("note_type, note_date, next_follow_up_date")
    .eq("entity_type", "Lead")
    .eq("person_id", leadId);
  const rows = (remaining as any[]) || [];
  const hasOutreach = rows.some((r) => OUTREACH_NOTE_TYPES_SET.has(r.note_type));

  const updates: Record<string, any> = {};
  if (current === "Working" && !hasOutreach) {
    updates.status = "New";
  }

  // Recompute last_contact_date and next_follow_up_date.
  const contactDates = rows
    .filter((r) => OUTREACH_NOTE_TYPES_SET.has(r.note_type))
    .map((r) => (r.note_date || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  updates.last_contact_date = contactDates.length ? contactDates[contactDates.length - 1] : null;

  const todayKey = new Date().toISOString().slice(0, 10);
  const futureFollowUps = rows
    .map((r) => (r.next_follow_up_date || "").slice(0, 10))
    .filter((d) => d && d >= todayKey)
    .sort();
  updates.next_follow_up_date = futureFollowUps[0] || null;

  if (Object.keys(updates).length > 0) {
    await supabase
      .from("booking_leads" as any)
      .update(updates as any)
      .eq("id", leadId);
  }
}

export const updateNote = async (
  id: string,
  updates: { note_body?: string; note_date?: string; next_follow_up_date?: string | null },
) => {
  const { error } = await supabase
    .from("notes")
    .update(updates as any)
    .eq("id", id);
  if (error) throw error;
};

// Follow-up queue view

export const fetchFollowUpQueue = async () => {
  const { data, error } = await supabase.from("follow_up_queue" as any).select("*");
  if (error) throw error;
  return data;
};

// Order financials view

export const fetchOrderFinancials = async () => {
  const { data, error } = await supabase.from("order_financials" as any).select("*");
  if (error) throw error;
  return data;
};

// Customer summary view

export const fetchCustomerSummary = async () => {
  const { data, error } = await supabase.from("customer_summary" as any).select("*");
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

export const fetchBookingLead = async (id: string): Promise<BookingLead> => {
  const { data, error } = await supabase
    .from("booking_leads" as any)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as BookingLead;
};

export const createBookingLead = async (lead: Partial<BookingLead> & { name: string }) => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("booking_leads" as any)
    .insert(withNormalizedPhone({ ...lead, owner_user_id: userId }) as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as BookingLead;
};

export const updateBookingLead = async (id: string, updates: Partial<BookingLead>) => {
  const { error } = await supabase
    .from("booking_leads" as any)
    .update(withNormalizedPhone(updates) as any)
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
      address_line_1: (lead as any).address_line_1 || null,
      city: (lead as any).city || null,
      state_territory: (lead as any).state_territory || null,
      postal_code: (lead as any).postal_code || null,
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
  const eventType = "Party";
  const eventId = generateEventId(eventType, dateStr, lead.name, existingEventIds);
  const { error: evErr } = await supabase.from("events").insert({
    event_id: eventId,
    event_type: eventType,
    event_date: null, // date TBD, user sets on event page
    hostess_name: lead.name,
    guest_count: 0,
    owner_user_id: userId,
    notes: lead.notes ? `Converted from booking lead. ${lead.notes}` : "Converted from booking lead.",
  } as any);
  if (evErr) throw evErr;

  // Generate workflow tasks for the new event
  try {
    await generateEventWorkflowTasks(eventId, null);
  } catch (e) {
    console.error("Failed to generate workflow tasks for converted lead", e);
  }

  return { customer, eventId };
};

// Team Consultants
export const fetchTeamConsultants = async (): Promise<TeamConsultant[]> => {
  const { data, error } = await supabase.from("team_consultants").select("*").order("name");
  if (error) throw error;
  return data as unknown as TeamConsultant[];
};

export const createTeamConsultant = async (
  consultant: Partial<TeamConsultant> & { name: string },
): Promise<TeamConsultant> => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("team_consultants")
    .insert(withNormalizedPhone({ ...consultant, owner_user_id: userId }) as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as TeamConsultant;
};

export const updateTeamConsultant = async (id: string, updates: Partial<TeamConsultant>): Promise<void> => {
  const { error } = await supabase
    .from("team_consultants")
    .update(withNormalizedPhone(updates) as any)
    .eq("id", id);
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

export const createLeadershipMember = async (
  member: Partial<LeadershipMember> & { name: string },
): Promise<LeadershipMember> => {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("leadership_members")
    .insert({ ...member, owner_user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as LeadershipMember;
};

export const updateLeadershipMember = async (id: string, updates: Partial<LeadershipMember>): Promise<void> => {
  const { error } = await supabase
    .from("leadership_members")
    .update(updates as any)
    .eq("id", id);
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

export const createEventTask = async (task: {
  event_id: string;
  task_name: string;
  task_type: string;
  due_date?: string | null;
}) => {
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
  const ooo = await fetchScheduleSettings();
  const workdays = buildWorkdayFlags(ooo);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // Task 1: Send Hostess Form — due today (skip blocked days)
  const todayAdjusted = nextAvailableDay(todayDate, ooo, new Set(), workdays);
  const today = toLocalDateKeyImport(todayAdjusted);

  const tasks: Array<{
    event_id: string;
    task_name: string;
    task_type: string;
    due_date: string | null;
    owner_user_id: string | null;
  }> = [
    {
      event_id: eventId,
      task_name: "Send hostess pre-profile form",
      task_type: "hostess_form",
      due_date: today,
      owner_user_id: userId,
    },
  ];

  // Pre-event tasks (only if event_date is set)
  if (eventDate) {
    const ed = new Date(eventDate + "T12:00:00");
    const sevenBefore = new Date(ed);
    sevenBefore.setDate(ed.getDate() - 7);
    const fiveBefore = new Date(ed);
    fiveBefore.setDate(ed.getDate() - 5);
    const threeBefore = new Date(ed);
    threeBefore.setDate(ed.getDate() - 3);
    const twoBefore = new Date(ed);
    twoBefore.setDate(ed.getDate() - 2);
    const oneBefore = new Date(ed);
    oneBefore.setDate(ed.getDate() - 1);

    // Smart-schedule each pre-event task
    const fmt = (d: Date) => toLocalDateKeyImport(nextAvailableWeekday(d, ooo, new Set(), workdays));

    tasks.push(
      {
        event_id: eventId,
        task_name: "Follow up: has hostess filled out form?",
        task_type: "pre_profile",
        due_date: fmt(fiveBefore),
        owner_user_id: userId,
      },
      {
        event_id: eventId,
        task_name: "Invitation made & sent to guests",
        task_type: "invitation_sent",
        due_date: fmt(fiveBefore),
        owner_user_id: userId,
      },
      {
        event_id: eventId,
        task_name: "Soft reach out #1 to hostess (1 week out)",
        task_type: "soft_reach_1",
        due_date: fmt(sevenBefore),
        owner_user_id: userId,
      },
      {
        event_id: eventId,
        task_name: "Soft reach out #2 + guest reminders (2-3 days out)",
        task_type: "soft_reach_2",
        due_date: fmt(threeBefore),
        owner_user_id: userId,
      },
      {
        event_id: eventId,
        task_name: "Day-before confirmation with hostess",
        task_type: "final_confirmation",
        due_date: fmt(oneBefore),
        owner_user_id: userId,
      },
    );
  }

  const { error } = await supabase.from("event_tasks" as any).insert(tasks as any);
  if (error) throw error;
};

/** Trigger task when hostess form is completed */
export const generateGuestInviteTask = async (eventId: string) => {
  const userId = await getCurrentUserId();
  const ooo = await fetchScheduleSettings();
  const workdays = buildWorkdayFlags(ooo);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const adjusted = nextAvailableDay(todayDate, ooo, new Set(), workdays);
  const today = toLocalDateKeyImport(adjusted);

  // Check if already exists
  const { data: existing } = await supabase
    .from("event_tasks" as any)
    .select("id")
    .eq("event_id", eventId)
    .eq("task_type", "guest_invite");
  if (existing && existing.length > 0) return;

  const { error } = await supabase
    .from("event_tasks" as any)
    .insert({
      event_id: eventId,
      task_name: "Send guest invite + guest form",
      task_type: "guest_invite",
      due_date: today,
      owner_user_id: userId,
    } as any);
  if (error) throw error;
};

// ─── Schedule Settings (OOO + Light Mode) ───

export interface ScheduleSettings {
  id?: string;
  user_id?: string;
  ooo_start_date: string | null;
  ooo_end_date: string | null;
  ooo_followup_snapshot?: unknown | null;
  ooo_followup_frozen_on?: string | null;
  light_schedule_mode: boolean;
  workday_monday: boolean;
  workday_tuesday: boolean;
  workday_wednesday: boolean;
  workday_thursday: boolean;
  workday_friday: boolean;
  workday_saturday: boolean;
  workday_sunday: boolean;
  daily_customer_followup_limit?: number;
  daily_lead_followup_limit?: number;
}

export const fetchScheduleSettings = async (): Promise<ScheduleSettings | null> => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("user_schedule_settings" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ScheduleSettings | null;
};

export const upsertScheduleSettings = async (settings: Partial<ScheduleSettings>): Promise<void> => {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { data: existing } = await supabase
    .from("user_schedule_settings" as any)
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_schedule_settings" as any)
      .update({ ...settings, updated_at: new Date().toISOString() } as any)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("user_schedule_settings" as any)
      .insert({ ...settings, user_id: userId } as any);
    if (error) throw error;
  }
};

// ─── Custom Blackout Days ───

export interface BlackoutDay {
  id: string;
  user_id: string;
  blackout_date: string;
  label: string | null;
  created_at: string;
}

export const fetchBlackoutDays = async (): Promise<BlackoutDay[]> => {
  const { data, error } = await supabase
    .from("custom_blackout_days" as any)
    .select("*")
    .order("blackout_date", { ascending: true });
  if (error) throw error;
  return data as unknown as BlackoutDay[];
};

export const createBlackoutDay = async (blackout_date: string, label?: string): Promise<void> => {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from("custom_blackout_days" as any)
    .insert({ user_id: userId, blackout_date, label: label || null } as any);
  if (error) throw error;
};

export const deleteBlackoutDay = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("custom_blackout_days" as any)
    .delete()
    .eq("id", id);
  if (error) throw error;
};

// ─── Follow-Up Backlog Cleanup (post Out of Office) ───

/**
 * Find all follow-ups (customers, prospects, booking_leads) whose
 * next_follow_up_date is on/before `cutoffDate` (i.e. became due/overdue
 * during or before the cutoff). Counts are per-table.
 */
export const countOverdueFollowUps = async (
  cutoffDate: string,
): Promise<{
  customers: number;
  prospects: number;
  booking_leads: number;
  total: number;
}> => {
  const userId = await getCurrentUserId();
  if (!userId) return { customers: 0, prospects: 0, booking_leads: 0, total: 0 };

  const [c, p, b] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .not("next_follow_up_date", "is", null)
      .lte("next_follow_up_date", cutoffDate),
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .not("next_follow_up_date", "is", null)
      .lte("next_follow_up_date", cutoffDate),
    supabase
      .from("booking_leads")
      .select("id", { count: "exact", head: true })
      .not("next_follow_up_date", "is", null)
      .lte("next_follow_up_date", cutoffDate),
  ]);

  const customers = c.count ?? 0;
  const prospects = p.count ?? 0;
  const booking_leads = b.count ?? 0;
  return { customers, prospects, booking_leads, total: customers + prospects + booking_leads };
};

/**
 * Reset all overdue/due follow-ups (next_follow_up_date <= cutoffDate).
 * mode "today"  → set next_follow_up_date to today
 * mode "clear"  → set next_follow_up_date to null (no follow-up needed)
 */
export const resetOverdueFollowUps = async (
  cutoffDate: string,
  mode: "today" | "clear",
): Promise<{ customers: number; prospects: number; booking_leads: number }> => {
  const today = new Date().toISOString().split("T")[0];
  const newDate: string | null = mode === "today" ? today : null;

  const updateTable = async (table: "customers" | "prospects" | "booking_leads") => {
    const { data, error } = await supabase
      .from(table)
      .update({ next_follow_up_date: newDate } as any)
      .not("next_follow_up_date", "is", null)
      .lte("next_follow_up_date", cutoffDate)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  };

  const [customers, prospects, booking_leads] = await Promise.all([
    updateTable("customers"),
    updateTable("prospects"),
    updateTable("booking_leads"),
  ]);

  return { customers, prospects, booking_leads };
};

export const convertProspectToConsultant = async (
  prospect: Prospect,
  extras?: { next_coaching_date?: string | null; coaching_focus?: string | null },
): Promise<TeamConsultant> => {
  const userId = await getCurrentUserId();
  const { data: consultant, error: cErr } = await supabase
    .from("team_consultants")
    .insert({
      name: prospect.name,
      phone: prospect.phone,
      email: prospect.email,
      address_line_1: (prospect as any).address_line_1 || null,
      city: (prospect as any).city || null,
      state_territory: (prospect as any).state_territory || null,
      postal_code: (prospect as any).postal_code || null,
      prospect_id: prospect.id,
      join_date: new Date().toISOString().split("T")[0],
      status: "Active",
      focus_group: "New Consultant",
      onboarding_stage: "New",
      coaching_focus: extras?.coaching_focus || null,
      next_coaching_date: extras?.next_coaching_date || null,
      notes: prospect.notes ? `Converted from prospect. ${prospect.notes}` : "Converted from prospect.",
      owner_user_id: userId,
    } as any)
    .select()
    .single();
  if (cErr) throw cErr;

  await supabase
    .from("prospects")
    .update({ opportunity_status: "Converted" } as any)
    .eq("id", prospect.id);

  if (prospect.customer_id) {
    await supabase
      .from("customers")
      .update({ relationship_status: "Consultant" } as any)
      .eq("id", prospect.customer_id);
  }

  return consultant as unknown as TeamConsultant;
};

// Convert a customer to a consultant (creates team_consultants record, updates customer)
export const convertCustomerToConsultant = async (
  customer: Customer,
  extras?: { next_coaching_date?: string | null; coaching_focus?: string | null },
): Promise<TeamConsultant> => {
  const userId = await getCurrentUserId();

  // Check if already a consultant
  const { data: existing } = await supabase
    .from("team_consultants")
    .select("id")
    .or(`name.eq.${customer.full_name},phone.eq.${customer.phone || "NONE"}`)
    .limit(1);
  if (existing && existing.length > 0) {
    throw new Error("This person already exists as a consultant");
  }

  const nameParts = customer.full_name.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const { data: consultant, error: cErr } = await supabase
    .from("team_consultants")
    .insert({
      name: customer.full_name,
      first_name: firstName,
      last_name: lastName,
      phone: customer.phone,
      email: customer.email,
      birthday: (customer as any).birthday || null,
      address_line_1: customer.address_line_1,
      city: customer.city,
      state_territory: customer.state_territory,
      postal_code: customer.postal_code,
      join_date: new Date().toISOString().split("T")[0],
      status: "Active",
      focus_group: "New Consultant",
      onboarding_stage: "New",
      coaching_focus: extras?.coaching_focus || null,
      next_coaching_date: extras?.next_coaching_date || null,
      notes: customer.notes ? `Converted from customer. ${customer.notes}` : "Converted from customer.",
      owner_user_id: userId,
    } as any)
    .select()
    .single();
  if (cErr) throw cErr;

  // Update customer record to mark as Consultant
  await supabase
    .from("customers")
    .update({
      relationship_status: "Consultant",
      next_follow_up_date: null,
      follow_up_reason: null,
      new_follow_up_stage: null,
    } as any)
    .eq("id", customer.id);

  return consultant as unknown as TeamConsultant;
};

// Convert a consultant back to a customer (updates customer record, removes from team_consultants)
export const convertConsultantToCustomer = async (consultant: TeamConsultant): Promise<void> => {
  // Find matching customer record by name/phone/email
  let customerId: string | null = null;

  // Try to find existing customer record
  const { data: matches } = await supabase
    .from("customers")
    .select("id")
    .eq("relationship_status", "Consultant")
    .or(`full_name.eq.${consultant.name},phone.eq.${consultant.phone || "NONE"}`)
    .limit(1);

  if (matches && matches.length > 0) {
    customerId = matches[0].id;
  }

  if (customerId) {
    // Update existing customer record back to Former Consultant, carry latest address
    await supabase
      .from("customers")
      .update({
        relationship_status: "Former Consultant",
        address_line_1: consultant.address_line_1 || undefined,
        city: consultant.city || undefined,
        state_territory: consultant.state_territory || undefined,
        postal_code: consultant.postal_code || undefined,
      } as any)
      .eq("id", customerId);
  } else {
    // Create a customer record if none exists
    const userId = await getCurrentUserId();
    await supabase.from("customers").insert({
      full_name: consultant.name,
      phone: consultant.phone,
      email: consultant.email,
      birthday: consultant.birthday,
      address_line_1: consultant.address_line_1,
      city: consultant.city,
      state_territory: consultant.state_territory,
      postal_code: consultant.postal_code,
      relationship_status: "Former Consultant",
      notes: consultant.notes ? `Converted from consultant. ${consultant.notes}` : "Converted from consultant.",
      owner_user_id: userId,
    } as any);
  }

  // Remove from team_consultants
  await supabase.from("team_consultants").delete().eq("id", consultant.id);
};

// Zoom Defaults
export const fetchZoomDefaults = async () => {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("zoom_defaults" as any)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as any;
};

export const upsertZoomDefaults = async (defaults: {
  zoom_id?: string | null;
  zoom_password?: string | null;
  zoom_link?: string | null;
  home_office_address?: string | null;
}) => {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("zoom_defaults" as any)
    .upsert({ ...defaults, user_id: userId } as any, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
};
