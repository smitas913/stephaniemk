
CREATE TABLE public.event_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  name text NOT NULL,
  phone text NULL,
  notes text NULL,
  converted_customer_id uuid NULL,
  owner_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events ADD COLUMN ordering_guest_count integer NULL DEFAULT 0;

ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view event guests" ON public.event_guests FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert event guests" ON public.event_guests FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update event guests" ON public.event_guests FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete event guests" ON public.event_guests FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));
