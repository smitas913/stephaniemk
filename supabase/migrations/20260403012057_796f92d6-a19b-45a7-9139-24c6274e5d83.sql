ALTER TABLE public.team_consultants 
  ADD COLUMN IF NOT EXISTS consultant_id text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_territory text,
  ADD COLUMN IF NOT EXISTS postal_code text;