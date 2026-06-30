ALTER TABLE public.team_consultants
  ADD COLUMN IF NOT EXISTS debut_date date,
  ADD COLUMN IF NOT EXISTS onboarding_exit_status text,
  ADD COLUMN IF NOT EXISTS onboarding_exit_date date,
  ADD COLUMN IF NOT EXISTS onboarding_tracker jsonb NOT NULL DEFAULT '{}'::jsonb;