ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_synced_at timestamp with time zone;