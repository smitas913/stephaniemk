-- Add skincare customer tracking fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_skincare_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skincare_started_at date;

-- Trigger: stamp skincare_started_at the FIRST time is_skincare_customer becomes true.
-- Never overwrite once set, so historical "new skincare customer" counts are stable
-- even if the flag is later toggled off and back on.
CREATE OR REPLACE FUNCTION public.stamp_skincare_started_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_skincare_customer = true AND NEW.skincare_started_at IS NULL THEN
    NEW.skincare_started_at := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_skincare_started_at ON public.customers;
CREATE TRIGGER trg_stamp_skincare_started_at
BEFORE INSERT OR UPDATE OF is_skincare_customer ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.stamp_skincare_started_at();

-- Helpful index for monthly counting
CREATE INDEX IF NOT EXISTS idx_customers_skincare_started_at
  ON public.customers (skincare_started_at)
  WHERE skincare_started_at IS NOT NULL;

-- Add new momentum metric for "new_skincare_customers" for any user that has monthly goals
INSERT INTO public.momentum_goals (user_id, metric_key, metric_label, period, goal_value, sort_order, is_visible)
SELECT DISTINCT user_id, 'new_skincare_customers', 'New Skincare Customers', 'monthly', 5, 99, true
FROM public.momentum_goals
WHERE period = 'monthly'
  AND user_id NOT IN (SELECT user_id FROM public.momentum_goals WHERE metric_key = 'new_skincare_customers' AND period = 'monthly');

-- Hide "follow_ups" on the monthly view by default (user can re-enable via Manage hidden goals)
UPDATE public.momentum_goals
SET is_visible = false
WHERE metric_key = 'follow_ups' AND period = 'monthly';