CREATE TABLE public.facial_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  phone text,
  email text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_territory text,
  postal_code text,
  birthday date,
  skin_type text,
  foundation_shade text,
  notes text,
  raw_notes text,
  facial_date date,
  scan_pdf_url text,
  event_id text,
  source_guest_id uuid,
  converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  owner_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facial_contacts TO authenticated;
GRANT ALL ON public.facial_contacts TO service_role;

ALTER TABLE public.facial_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their facial contacts"
  ON public.facial_contacts FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "Owners can insert their facial contacts"
  ON public.facial_contacts FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owners can update their facial contacts"
  ON public.facial_contacts FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owners can delete their facial contacts"
  ON public.facial_contacts FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE INDEX idx_facial_contacts_owner ON public.facial_contacts(owner_user_id);
CREATE INDEX idx_facial_contacts_event ON public.facial_contacts(event_id);

CREATE TRIGGER set_facial_contacts_updated_at
  BEFORE UPDATE ON public.facial_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS scan_pdf_url text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS skin_type text;
ALTER TABLE public.event_guests ADD COLUMN IF NOT EXISTS converted_facial_contact_id uuid REFERENCES public.facial_contacts(id) ON DELETE SET NULL;