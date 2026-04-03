ALTER TABLE public.expenses ADD COLUMN event_type text DEFAULT NULL;
ALTER TABLE public.expenses ADD COLUMN event_year integer DEFAULT NULL;