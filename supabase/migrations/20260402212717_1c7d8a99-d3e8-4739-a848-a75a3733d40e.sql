
-- Create booking lead status enum
CREATE TYPE public.booking_lead_status AS ENUM ('New', 'Contacted', 'Booked', 'Not Interested');

-- Create booking_leads table
CREATE TABLE public.booking_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  lead_source TEXT,
  status booking_lead_status NOT NULL DEFAULT 'New',
  last_contact_date DATE,
  next_follow_up_date DATE,
  notes TEXT,
  converted_customer_id UUID,
  owner_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.booking_leads ENABLE ROW LEVEL SECURITY;

-- RLS policies for internal users
CREATE POLICY "Internal users can view booking leads"
  ON public.booking_leads FOR SELECT TO authenticated
  USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can insert booking leads"
  ON public.booking_leads FOR INSERT TO authenticated
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update booking leads"
  ON public.booking_leads FOR UPDATE TO authenticated
  USING (is_internal_user(auth.uid()))
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete booking leads"
  ON public.booking_leads FOR DELETE TO authenticated
  USING (is_internal_user(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER set_booking_leads_updated_at
  BEFORE UPDATE ON public.booking_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
