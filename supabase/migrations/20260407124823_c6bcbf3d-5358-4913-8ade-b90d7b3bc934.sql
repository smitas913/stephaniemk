
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS address_line_1 text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS state_territory text;
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS postal_code text;

ALTER TABLE public.booking_leads ADD COLUMN IF NOT EXISTS address_line_1 text;
ALTER TABLE public.booking_leads ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.booking_leads ADD COLUMN IF NOT EXISTS state_territory text;
ALTER TABLE public.booking_leads ADD COLUMN IF NOT EXISTS postal_code text;
