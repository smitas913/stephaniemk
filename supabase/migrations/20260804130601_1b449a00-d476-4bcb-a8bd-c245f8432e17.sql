CREATE OR REPLACE FUNCTION public.validate_prospect_next_step_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.opportunity_status NOT IN ('Converted', 'Joined', 'Closed', 'Not Interested')
     AND NEW.next_step_date IS NULL
     AND NEW.next_follow_up_date IS NULL THEN
    RAISE EXCEPTION 'A next step date is required for active prospects';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_prospect_next_step_date ON public.prospects;
CREATE TRIGGER trg_validate_prospect_next_step_date
BEFORE INSERT OR UPDATE ON public.prospects
FOR EACH ROW
EXECUTE FUNCTION public.validate_prospect_next_step_date();