
-- 1. Add financial columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS wholesale_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payout_amount numeric DEFAULT NULL;

-- 2. Create unified notes table
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('Customer', 'Prospect')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE,
  note_date date NOT NULL DEFAULT CURRENT_DATE,
  note_type text NOT NULL DEFAULT 'General' CHECK (note_type IN ('Call', 'Text', 'Email', 'General')),
  note_body text NOT NULL,
  next_follow_up_date date,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notes_customer_check CHECK (
    (entity_type = 'Customer' AND customer_id IS NOT NULL AND prospect_id IS NULL)
    OR (entity_type = 'Prospect' AND prospect_id IS NOT NULL AND customer_id IS NULL)
  )
);

-- Enable RLS on notes
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for notes (mirror internal user pattern)
CREATE POLICY "Internal users can view notes" ON public.notes
  FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert notes" ON public.notes
  FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update notes" ON public.notes
  FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete notes" ON public.notes
  FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));

-- 3. Migrate existing customer_notes into unified notes
INSERT INTO public.notes (entity_type, customer_id, note_type, note_body, note_date, owner_user_id, created_at)
SELECT 'Customer', customer_id, note_type, note_text, created_at::date, owner_user_id, created_at
FROM public.customer_notes;

-- 4. Migrate existing prospect_notes into unified notes
INSERT INTO public.notes (entity_type, prospect_id, note_type, note_body, note_date, owner_user_id, created_at)
SELECT 'Prospect', prospect_id, 'General', note_text, created_at::date, owner_user_id, created_at
FROM public.prospect_notes;

-- 5. Add customer_source to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_source text;

-- 6. Add event fields: future_bookings_count, sharing_appointments_count
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS future_bookings_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sharing_appointments_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- 7. Trigger: when note inserted, update last_contact_date and next_follow_up_date
CREATE OR REPLACE FUNCTION public.update_entity_on_note_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.entity_type = 'Customer' AND NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET last_contacted = NEW.note_date,
        next_follow_up_date = COALESCE(NEW.next_follow_up_date, next_follow_up_date),
        updated_at = now()
    WHERE id = NEW.customer_id;
  ELSIF NEW.entity_type = 'Prospect' AND NEW.prospect_id IS NOT NULL THEN
    UPDATE public.prospects
    SET last_contact_date = NEW.note_date,
        next_follow_up_date = COALESCE(NEW.next_follow_up_date, next_follow_up_date),
        updated_at = now()
    WHERE id = NEW.prospect_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_entity_on_note_insert
  AFTER INSERT ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_entity_on_note_insert();
