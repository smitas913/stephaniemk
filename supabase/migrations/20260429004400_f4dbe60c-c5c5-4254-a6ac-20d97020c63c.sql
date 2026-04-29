ALTER TABLE public.user_schedule_settings
  ADD COLUMN IF NOT EXISTS daily_customer_followup_limit integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS daily_lead_followup_limit integer NOT NULL DEFAULT 10;