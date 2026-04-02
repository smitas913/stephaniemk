export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  birthday_mmdd: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_territory: string | null;
  postal_code: string | null;
  current_status: string | null;
  profile_date_first_order_date: string | null;
  last_order_mk: string | null;
  last_order_date_order_log: string | null;
  last_contacted: string | null;
  follow_up_reason: string | null;
  notes: string | null;
  new_follow_up_stage: string | null;
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
  payment_type: string | null;
  retail_amount: number;
  notes: string | null;
  parent_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderWithCustomer extends Order {
  customers: { full_name: string } | null;
}

export interface CustomerComputed {
  new_first_90_days: string;
  category: string;
  vip: string;
  last_order_effective: string | null;
  days_since_last_order: number | null;
  orders_this_year: number;
  retail_this_year: number;
  next_follow_up: string | null;
  follow_up_status: string;
}

export const CUSTOMER_STATUSES = ["Customer", "Consultant", "Former Consultant"] as const;
export const ORDER_TYPES = ["Reorder", "Party", "Facial"] as const;
export const FACE_TYPES = ["Customer", "Guest", "Hostess", "Facial"] as const;
export const PAYMENT_TYPES = ["Cash", "Venmo", "Zelle", "Check", "Credit Card", "CashApp", "Paypal", "Other"] as const;
export const FOLLOW_UP_STAGES = ["2 Day", "2 Week", "2 Month", "Complete"] as const;
export const ORDER_SOURCES = ["Text", "Phone", "Online", "In Person"] as const;
