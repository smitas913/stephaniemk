
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS hostess_name text;
