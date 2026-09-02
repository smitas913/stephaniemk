ALTER TABLE public.facial_contacts
  ADD COLUMN IF NOT EXISTS beauty_notes jsonb NOT NULL DEFAULT '{}'::jsonb;