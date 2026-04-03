CREATE TABLE public.user_schedule_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  ooo_start_date date,
  ooo_end_date date,
  light_schedule_mode boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_user_schedule_settings_user ON public.user_schedule_settings(user_id);

ALTER TABLE public.user_schedule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schedule settings" ON public.user_schedule_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own schedule settings" ON public.user_schedule_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own schedule settings" ON public.user_schedule_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
