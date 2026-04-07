
-- Add day_type column to daily_focus_progress
ALTER TABLE public.daily_focus_progress ADD COLUMN IF NOT EXISTS day_type text NOT NULL DEFAULT 'power';

-- Create day_type_targets table for per-day-type target overrides
CREATE TABLE IF NOT EXISTS public.day_type_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_type text NOT NULL DEFAULT 'power',
  sort_order integer NOT NULL DEFAULT 0,
  target integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_type, sort_order)
);

ALTER TABLE public.day_type_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own day type targets" ON public.day_type_targets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own day type targets" ON public.day_type_targets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own day type targets" ON public.day_type_targets
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own day type targets" ON public.day_type_targets
  FOR DELETE TO authenticated USING (user_id = auth.uid());
