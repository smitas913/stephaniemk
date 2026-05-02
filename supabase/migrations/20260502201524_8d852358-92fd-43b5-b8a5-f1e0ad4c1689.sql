-- 1. Add became_customer_date column (nullable; backfill stays empty for historical records)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS became_customer_date date;

-- 2. Trigger function: auto-stamp became_customer_date the first time
--    a record is/becomes a "Customer" (does not overwrite manual edits).
CREATE OR REPLACE FUNCTION public.stamp_became_customer_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.relationship_status, 'Customer') = 'Customer'
       AND NEW.became_customer_date IS NULL THEN
      NEW.became_customer_date := COALESCE(NEW.date_added, CURRENT_DATE);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only stamp on transition INTO Customer, and only if not already set.
    IF NEW.relationship_status = 'Customer'
       AND COALESCE(OLD.relationship_status, '') <> 'Customer'
       AND NEW.became_customer_date IS NULL THEN
      NEW.became_customer_date := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger
DROP TRIGGER IF EXISTS trg_stamp_became_customer_date ON public.customers;
CREATE TRIGGER trg_stamp_became_customer_date
BEFORE INSERT OR UPDATE OF relationship_status ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.stamp_became_customer_date();