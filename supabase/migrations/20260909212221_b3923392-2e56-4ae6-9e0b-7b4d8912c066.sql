ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_title text;
UPDATE public.events SET event_title = hostess_name WHERE google_calendar_event_id IS NOT NULL AND event_title IS NULL;