ALTER TABLE public.events ADD COLUMN IF NOT EXISTS thank_you_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS thank_you_sent boolean NOT NULL DEFAULT false;