ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_venue_type text;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS hostess_converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;