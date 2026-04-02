
-- Rename retail_total to retail_amount
ALTER TABLE public.orders RENAME COLUMN retail_total TO retail_amount;

-- Drop the old source column
ALTER TABLE public.orders DROP COLUMN IF EXISTS source;

-- Add new columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS face_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hostess boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS half_price_deal boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS birthday boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parent_event_id text;

-- Backfill customer_name from customers table for existing orders
UPDATE public.orders o
SET customer_name = c.full_name
FROM public.customers c
WHERE o.customer_id = c.id AND o.customer_name IS NULL;
