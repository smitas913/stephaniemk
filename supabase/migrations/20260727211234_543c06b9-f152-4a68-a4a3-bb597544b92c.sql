ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS is_career_chat boolean NOT NULL DEFAULT false;
UPDATE public.prospects SET is_career_chat = true WHERE last_touch_layer IS NOT NULL;