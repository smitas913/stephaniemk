
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS consultant_notes text,
  ADD COLUMN IF NOT EXISTS director_info text;
