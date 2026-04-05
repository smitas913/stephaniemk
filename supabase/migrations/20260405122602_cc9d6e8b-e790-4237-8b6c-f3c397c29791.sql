ALTER TABLE public.user_schedule_settings
  ADD COLUMN IF NOT EXISTS workday_monday boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workday_tuesday boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workday_wednesday boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workday_thursday boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workday_friday boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workday_saturday boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workday_sunday boolean NOT NULL DEFAULT true;