
ALTER TABLE public.customers
ADD COLUMN follow_up_needed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN last_contact_date TIMESTAMP WITH TIME ZONE;
