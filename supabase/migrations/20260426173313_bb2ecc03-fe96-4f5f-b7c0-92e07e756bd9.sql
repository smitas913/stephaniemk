-- Business growth goals (production + unit size + future metrics)
CREATE TABLE IF NOT EXISTS public.business_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  metric_key TEXT NOT NULL,
  metric_label TEXT NOT NULL,
  period TEXT NOT NULL, -- 'weekly' | 'monthly'
  goal_value NUMERIC NOT NULL DEFAULT 0,
  manual_actual NUMERIC, -- nullable; when null and auto_track_key is set, compute from data
  auto_track_key TEXT, -- e.g. 'consultant_count' for unit size
  unit TEXT NOT NULL DEFAULT 'count', -- 'count' | 'currency'
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric_key, period)
);

ALTER TABLE public.business_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business goals" ON public.business_goals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own business goals" ON public.business_goals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own business goals" ON public.business_goals
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own business goals" ON public.business_goals
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER set_business_goals_updated_at
  BEFORE UPDATE ON public.business_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();