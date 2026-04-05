ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS allow_non_working_day boolean NOT NULL DEFAULT false;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS allow_non_working_day boolean NOT NULL DEFAULT false;
ALTER TABLE public.booking_leads ADD COLUMN IF NOT EXISTS allow_non_working_day boolean NOT NULL DEFAULT false;
ALTER TABLE public.team_consultants ADD COLUMN IF NOT EXISTS allow_non_working_day boolean NOT NULL DEFAULT false;
ALTER TABLE public.event_tasks ADD COLUMN IF NOT EXISTS allow_non_working_day boolean NOT NULL DEFAULT false;
ALTER TABLE public.daily_plan_items ADD COLUMN IF NOT EXISTS allow_non_working_day boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS allow_non_working_day boolean NOT NULL DEFAULT false;