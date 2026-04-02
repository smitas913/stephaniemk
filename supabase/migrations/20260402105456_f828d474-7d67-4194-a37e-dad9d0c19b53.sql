
-- Attach the existing trigger function to orders table
CREATE TRIGGER trg_update_customer_last_order
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_customer_last_order();

-- Backfill all existing customers with their latest order date
UPDATE public.customers c
SET last_order_date_order_log = sub.max_date,
    updated_at = now()
FROM (
  SELECT customer_id, MAX(order_date) AS max_date
  FROM public.orders
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id;
