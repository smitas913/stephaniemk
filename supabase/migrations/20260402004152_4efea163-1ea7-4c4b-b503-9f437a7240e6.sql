
-- Drop existing trigger/function that references old columns
DROP FUNCTION IF EXISTS public.update_customer_stats() CASCADE;

-- Rename customers columns
ALTER TABLE public.customers RENAME COLUMN name TO full_name;
ALTER TABLE public.customers RENAME COLUMN last_contact_date TO last_contacted;
ALTER TABLE public.customers ALTER COLUMN last_contacted TYPE date USING last_contacted::date;

-- Drop columns that are no longer needed
ALTER TABLE public.customers DROP COLUMN IF EXISTS total_spent;
ALTER TABLE public.customers DROP COLUMN IF EXISTS follow_up_needed;
ALTER TABLE public.customers DROP COLUMN IF EXISTS last_order_date;

-- Add new customer columns
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birthday_mmdd text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line_1 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address_line_2 text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state_territory text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS current_status text DEFAULT 'Customer';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_date_first_order_date date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_order_mk date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_order_date_order_log date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS follow_up_reason text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS new_follow_up_stage text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Alter orders table: add new columns first, migrate data, then drop old
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text DEFAULT 'In Person';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS retail_total numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Migrate existing data
UPDATE public.orders SET source = order_source::text;
UPDATE public.orders SET payment_type = payment_method::text WHERE payment_method IS NOT NULL;
UPDATE public.orders SET retail_total = total_amount WHERE total_amount > 0;

-- Drop old order columns
ALTER TABLE public.orders DROP COLUMN IF EXISTS order_source;
ALTER TABLE public.orders DROP COLUMN IF EXISTS payment_method;
ALTER TABLE public.orders DROP COLUMN IF EXISTS payment_status;
ALTER TABLE public.orders DROP COLUMN IF EXISTS total_amount;

-- Trigger to auto-update last_order_date_order_log from orders
CREATE OR REPLACE FUNCTION public.update_customer_last_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _cid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _cid := OLD.customer_id;
  ELSE
    _cid := NEW.customer_id;
  END IF;
  UPDATE public.customers SET
    last_order_date_order_log = (SELECT MAX(order_date) FROM public.orders WHERE customer_id = _cid),
    updated_at = now()
  WHERE id = _cid;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_last_order_on_change
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_last_order();

-- Auto updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
