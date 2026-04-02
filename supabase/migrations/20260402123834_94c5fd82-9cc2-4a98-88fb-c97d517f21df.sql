
-- Create opportunity_status enum
CREATE TYPE public.opportunity_status AS ENUM ('New', 'Shared', 'Follow-Up', 'Interested', 'Not Interested', 'Joined');

-- Create prospects table
CREATE TABLE public.prospects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  opportunity_status opportunity_status NOT NULL DEFAULT 'New',
  date_shared DATE DEFAULT CURRENT_DATE,
  last_contact_date DATE,
  next_follow_up_date DATE,
  notes TEXT,
  owner_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create prospect_notes table
CREATE TABLE public.prospect_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_user_id UUID
);

-- Enable RLS
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for prospects
CREATE POLICY "Internal users can view prospects" ON public.prospects
  FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert prospects" ON public.prospects
  FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update prospects" ON public.prospects
  FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete prospects" ON public.prospects
  FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));

-- RLS policies for prospect_notes
CREATE POLICY "Internal users can view prospect notes" ON public.prospect_notes
  FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert prospect notes" ON public.prospect_notes
  FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update prospect notes" ON public.prospect_notes
  FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete prospect notes" ON public.prospect_notes
  FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));

-- Updated_at trigger for prospects
CREATE TRIGGER set_prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
