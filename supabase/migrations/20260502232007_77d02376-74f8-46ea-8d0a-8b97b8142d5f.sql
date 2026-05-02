-- Improve became_customer_date logic to favor user-entered event/order dates over system date.

-- 1. Update customer-side trigger: when transitioning to Customer, use earliest known order date
CREATE OR REPLACE FUNCTION public.stamp_became_customer_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  earliest_order date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.relationship_status, 'Customer') = 'Customer'
       AND NEW.became_customer_date IS NULL THEN
      -- Prefer explicit purchase-related dates over system date
      NEW.became_customer_date := COALESCE(
        NEW.profile_date_first_order_date,
        NEW.last_order_date_order_log,
        NEW.last_order_mk,
        NEW.date_added,
        CURRENT_DATE
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.relationship_status = 'Customer'
       AND COALESCE(OLD.relationship_status, '') <> 'Customer'
       AND NEW.became_customer_date IS NULL THEN
      SELECT MIN(order_date) INTO earliest_order
        FROM public.orders WHERE customer_id = NEW.id;
      NEW.became_customer_date := COALESCE(
        earliest_order,
        NEW.profile_date_first_order_date,
        NEW.last_order_date_order_log,
        NEW.last_order_mk,
        CURRENT_DATE
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. New trigger on orders: keep customer's became_customer_date = earliest order date
CREATE OR REPLACE FUNCTION public.sync_customer_first_order_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NEW.order_date IS NOT NULL THEN
    UPDATE public.customers
       SET became_customer_date = LEAST(COALESCE(became_customer_date, NEW.order_date), NEW.order_date)
     WHERE id = NEW.customer_id
       AND COALESCE(relationship_status, 'Customer') = 'Customer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_first_order_date ON public.orders;
CREATE TRIGGER trg_sync_customer_first_order_date
AFTER INSERT OR UPDATE OF order_date, customer_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_customer_first_order_date();

-- 3. Backfill: align became_customer_date to earliest real order date for existing customers
UPDATE public.customers c
SET became_customer_date = sub.first_order
FROM (
  SELECT customer_id, MIN(order_date) AS first_order
  FROM public.orders
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) sub
WHERE sub.customer_id = c.id
  AND COALESCE(c.relationship_status, 'Customer') = 'Customer'
  AND (c.became_customer_date IS NULL OR sub.first_order < c.became_customer_date);
