-- Update DNC trigger to drop event_tasks reference
CREATE OR REPLACE FUNCTION public.enforce_dnc_on_customer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  dnc_now boolean := 'DNC' = ANY(COALESCE(NEW.tags, '{}'::text[]));
  dnc_before boolean := 'DNC' = ANY(COALESCE(OLD.tags, '{}'::text[]));
BEGIN
  IF dnc_now AND NOT dnc_before THEN
    NEW.next_follow_up_date := NULL;
    NEW.new_follow_up_stage := NULL;
    NEW.dormant_follow_up_stage := NULL;
    NEW.needs_attention := false;

    UPDATE public.daily_plan_items
    SET is_canceled = true, canceled_at = now()
    WHERE customer_id = NEW.id
      AND plan_date >= CURRENT_DATE
      AND is_canceled = false;

    UPDATE public.catalog_campaign_customers
    SET follow_up_completed = true
    WHERE customer_id = NEW.id
      AND follow_up_completed = false;
  END IF;

  RETURN NEW;
END;
$function$;

-- Drop the event_tasks table entirely (Next Task feature retired)
DROP TABLE IF EXISTS public.event_tasks CASCADE;