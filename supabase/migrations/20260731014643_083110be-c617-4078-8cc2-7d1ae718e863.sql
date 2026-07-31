ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hostess_skin_type text,
  ADD COLUMN IF NOT EXISTS hostess_video_watched boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS skin_type text,
  ADD COLUMN IF NOT EXISTS video_watched boolean NOT NULL DEFAULT false;