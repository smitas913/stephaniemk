ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_status public.payment_status;

UPDATE public.orders
SET payment_status = CASE
  WHEN payment_type IS NULL THEN 'Unpaid'::public.payment_status
  ELSE 'Paid'::public.payment_status
END
WHERE payment_status IS NULL;

ALTER TABLE public.orders
ALTER COLUMN payment_status SET DEFAULT 'Paid'::public.payment_status;

ALTER TABLE public.orders
ALTER COLUMN payment_status SET NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_order_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status IS NULL THEN
    NEW.payment_status := CASE
      WHEN NEW.payment_type IS NULL THEN 'Unpaid'::public.payment_status
      ELSE 'Paid'::public.payment_status
    END;
  END IF;

  IF NEW.payment_status = 'Unpaid'::public.payment_status THEN
    NEW.payment_type := NULL;
  ELSIF NEW.payment_status IN ('Paid'::public.payment_status, 'Partial'::public.payment_status) AND NEW.payment_type IS NULL THEN
    RAISE EXCEPTION 'Payment method is required when payment status is %', NEW.payment_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_order_payment_fields ON public.orders;

CREATE TRIGGER normalize_order_payment_fields
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.normalize_order_payment_fields();