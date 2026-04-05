ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS reschedule_attempt_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reschedule_next_follow_up_date date,
  ADD COLUMN IF NOT EXISTS reschedule_last_contact_date date,
  ADD COLUMN IF NOT EXISTS requires_manual_next_step boolean NOT NULL DEFAULT false;