ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS task_invite_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_day_before_sent boolean NOT NULL DEFAULT false;