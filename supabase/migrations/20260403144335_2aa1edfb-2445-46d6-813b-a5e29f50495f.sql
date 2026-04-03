CREATE TABLE public.custom_blackout_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  blackout_date date NOT NULL,
  label text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_blackout_days_user ON public.custom_blackout_days(user_id);

ALTER TABLE public.custom_blackout_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blackout days" ON public.custom_blackout_days FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own blackout days" ON public.custom_blackout_days FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own blackout days" ON public.custom_blackout_days FOR DELETE TO authenticated USING (user_id = auth.uid());
