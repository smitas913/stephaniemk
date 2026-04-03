export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  birthday_mmdd: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_territory: string | null;
  postal_code: string | null;
  relationship_status: string | null;
  profile_date_first_order_date: string | null;
  last_order_mk: string | null;
  last_order_date_order_log: string | null;
  last_contacted: string | null;
  follow_up_reason: string | null;
  notes: string | null;
  new_follow_up_stage: string | null;
  next_follow_up_date: string | null;
  is_active: boolean;
  new_customer_flag: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  customer_name: string | null;
  order_date: string;
  event_id: string | null;
  order_type: string | null;
  face_type: string | null;
  hostess: boolean;
  half_price_deal: boolean;
  birthday: boolean;
  referral: boolean;
  payment_status: PaymentStatus;
  payment_type: string | null;
  retail_amount: number;
  wholesale_amount: number | null;
  payout_amount: number | null;
  notes: string | null;
  parent_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = "Paid" | "Unpaid" | "Partial";

export interface OrderWithCustomer extends Order {
  customers: { full_name: string } | null;
}

export interface CustomerComputed {
  new_first_90_days: string;
  activity_status: string;
  vip: string;
  last_order_effective: string | null;
  days_since_last_order: number | null;
  orders_this_year: number;
  retail_this_year: number;
  next_follow_up: string | null;
  follow_up_status: string;
  follow_up_reason: string;
  recently_contacted: boolean;
}

export const EVENT_FORMATS = ["In-Person", "Zoom"] as const;
export type EventFormat = typeof EVENT_FORMATS[number];

export const COACHING_STATUSES = ["Booked", "Coaching Scheduled", "Invites Sent", "Confirmed", "Completed"] as const;
export const RSVP_OPTIONS = ["Yes", "No", "Maybe"] as const;

export interface EventRecord {
  id: string;
  event_id: string;
  event_type: string | null;
  event_format: string;
  event_date: string | null;
  hostess_name: string | null;
  guest_count: number;
  ordering_guest_count: number | null;
  future_bookings_count: number | null;
  sharing_appointments_count: number | null;
  is_archived: boolean | null;
  notes: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
  hostess_phone: string | null;
  hostess_email: string | null;
  coaching_status: string | null;
  coaching_call_date: string | null;
  coaching_notes: string | null;
  checklist_invitations_sent: boolean;
  checklist_guest_list_received: boolean;
  checklist_google_form_completed: boolean;
  checklist_samples_sent: boolean;
  checklist_reminders_sent: boolean;
  google_form_link: string | null;
  hostess_next_action: string | null;
  hostess_next_action_date: string | null;
}

export interface EventGuest {
  id: string;
  event_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  converted_customer_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  rsvp: string | null;
  attending: boolean;
  ordered: boolean;
  interested: boolean;
}

export const RELATIONSHIP_STATUSES = ["Customer", "Consultant", "Former Consultant"] as const;
export const ORDER_TYPES = ["Reorder", "Party", "Facial", "Appointment", "Other"] as const;
export const FACE_TYPES = ["Customer", "Guest", "Hostess", "Facial"] as const;
export const PAYMENT_TYPES = ["Cash", "Venmo", "Zelle", "Check", "Credit Card", "CashApp", "Paypal", "MyShop", "Other"] as const;
export const FOLLOW_UP_STAGES = ["2 Day", "2 Week", "2 Month", "Complete"] as const;
export const ORDER_SOURCES = ["Text", "Phone", "Online", "In Person"] as const;

export interface CustomerNote {
  id: string;
  customer_id: string;
  note_text: string;
  note_type: string;
  created_at: string;
  owner_user_id: string | null;
}

export const NOTE_TYPES = ["Call", "Text", "Email", "In Person", "Follow-Up", "Other"] as const;

export interface Note {
  id: string;
  entity_type: "Customer" | "Prospect";
  customer_id: string | null;
  prospect_id: string | null;
  note_date: string;
  note_type: string;
  note_body: string;
  next_follow_up_date: string | null;
  owner_user_id: string | null;
  created_at: string;
}

export const OPPORTUNITY_STATUSES = ["Booked", "Shared", "Follow-Up", "Interested", "Not Interested", "Joined", "Converted", "Closed"] as const;

export const NEXT_STEP_TYPES = [
  "Follow-Up Call",
  "Invited to Event",
  "Attend Event",
  "Booked Party",
  "Booked Facial",
  "Send Information",
  "Other",
] as const;

export interface Prospect {
  id: string;
  customer_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  opportunity_status: string;
  date_shared: string | null;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  notes: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string | null;
  next_step_type: string | null;
  next_step_date: string | null;
  next_step_notes: string | null;
}

export interface ProspectNote {
  id: string;
  prospect_id: string;
  note_text: string;
  created_at: string;
  owner_user_id: string | null;
}

export const EXPENSE_CATEGORIES = ["Inventory", "Supplies", "Marketing", "Events", "Tools", "Admin / Office Help", "Accounting", "Meals", "Travel", "Networking"] as const;

export interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  notes: string | null;
  receipt_url: string | null;
  event_type: string | null;
  event_year: number | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export const EXPENSE_EVENT_TYPES = ["Seminar", "Career Conference", "Leadership Conference", "Fall Retreat", "Director Meeting", "Other Event"] as const;

export const INCOME_CATEGORIES = ["Commission", "Bonus", "Referral", "Other"] as const;

export interface Income {
  id: string;
  income_date: string;
  amount: number;
  category: string;
  source: string | null;
  notes: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export const BOOKING_LEAD_STATUSES = ["New", "Contacted", "Booked", "Not Interested"] as const;
export const BOOKING_LEAD_SOURCES = ["Networking", "Warm Chatter", "Referral", "Facial Box", "Bridal", "Vendor Table", "Social Media", "Other"] as const;
export const DEFAULT_LEAD_SOURCE = "Networking";

export interface BookingLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  lead_source: string | null;
  status: string;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  notes: string | null;
  converted_customer_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export const CONSULTANT_STATUSES = ["Active", "Inactive", "At Risk"] as const;

export const ONBOARDING_STAGES = ["New", "Started", "First Order", "First Party", "First Team Member", "Active Builder"] as const;

export const FOCUS_GROUPS = ["General", "New Consultant", "Key Consultant"] as const;

export const COACHING_FOCUS_OPTIONS = [
  "Set Up Account",
  "Product Knowledge",
  "Booking Practice",
  "First Party Prep",
  "Follow-Up Training",
  "Recruiting Conversation",
  "Confidence / Mindset",
  "Consistency",
] as const;

export interface TeamConsultant {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  join_date: string | null;
  status: string;
  last_order_date: string | null;
  next_coaching_date: string | null;
  notes: string | null;
  prospect_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string | null;
  onboarding_stage: string | null;
  coaching_focus: string | null;
  first_order_date: string | null;
  first_party_date: string | null;
  first_team_member_date: string | null;
  focus_group: string | null;
  consultant_id: string | null;
  birthday: string | null;
  address_line_1: string | null;
  city: string | null;
  state_territory: string | null;
  postal_code: string | null;
}

export const LEADERSHIP_GOALS = ["DIQ", "Director", "Senior Director", "National", "Other"] as const;

export interface LeadershipMember {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  current_title: string | null;
  goal: string | null;
  unit_members: number;
  personal_production: number;
  unit_production: number;
  next_coaching_date: string | null;
  notes: string | null;
  consultant_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string | null;
}
