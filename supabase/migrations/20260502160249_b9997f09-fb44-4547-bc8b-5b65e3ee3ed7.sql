-- Add attention/flag columns to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attention_reason text,
  ADD COLUMN IF NOT EXISTS flagged_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_customers_needs_attention
  ON public.customers (needs_attention) WHERE needs_attention = true;

-- Per-user preferences (weekly reset day, banner dismissals)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  weekly_reset_day smallint NOT NULL DEFAULT 1, -- 0=Sun..6=Sat, default Monday
  weekly_reset_last_dismissed date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preferences"
  ON public.user_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own preferences"
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own preferences"
  ON public.user_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
