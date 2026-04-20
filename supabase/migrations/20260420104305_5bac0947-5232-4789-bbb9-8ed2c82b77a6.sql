ALTER TABLE public.user_schedule_settings
ADD COLUMN IF NOT EXISTS ooo_followup_snapshot jsonb,
ADD COLUMN IF NOT EXISTS ooo_followup_frozen_on date;