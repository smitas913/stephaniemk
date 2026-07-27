ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS last_touch_layer text,
  ADD COLUMN IF NOT EXISTS next_touch_layer text;