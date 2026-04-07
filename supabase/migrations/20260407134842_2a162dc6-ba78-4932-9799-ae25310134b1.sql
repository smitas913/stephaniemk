
-- Table for user's 6 focus item configurations (labels, targets, order)
CREATE TABLE public.focus_item_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  default_target INTEGER NOT NULL DEFAULT 1,
  auto_track_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, sort_order)
);

ALTER TABLE public.focus_item_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own focus configs" ON public.focus_item_configs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own focus configs" ON public.focus_item_configs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own focus configs" ON public.focus_item_configs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own focus configs" ON public.focus_item_configs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Table for daily progress tracking per focus item
CREATE TABLE public.daily_focus_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  focus_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  auto_count INTEGER NOT NULL DEFAULT 0,
  manual_adjustment INTEGER NOT NULL DEFAULT 0,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, focus_date, sort_order)
);

ALTER TABLE public.daily_focus_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily progress" ON public.daily_focus_progress FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own daily progress" ON public.daily_focus_progress FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own daily progress" ON public.daily_focus_progress FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
