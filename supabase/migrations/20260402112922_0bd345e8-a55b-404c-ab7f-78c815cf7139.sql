
CREATE TABLE public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  event_date date,
  guest_count integer DEFAULT 0,
  notes text,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/admin can view events" ON public.events
  FOR SELECT TO authenticated
  USING (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can insert events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can update events" ON public.events
  FOR UPDATE TO authenticated
  USING (has_any_active_role(auth.uid()))
  WITH CHECK (has_any_active_role(auth.uid()));

CREATE POLICY "Owner/admin can delete events" ON public.events
  FOR DELETE TO authenticated
  USING (has_any_active_role(auth.uid()));

CREATE POLICY "Consultants can view own events" ON public.events
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid());

CREATE POLICY "Consultants can insert own events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid());

CREATE POLICY "Consultants can update own events" ON public.events
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'consultant'::app_role) AND owner_user_id = auth.uid());
