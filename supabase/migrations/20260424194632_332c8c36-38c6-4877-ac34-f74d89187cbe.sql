-- Fix: Skip and "No Follow-Up Needed" notes should NOT count as outreach activity.
-- Previously, the trigger always set last_contacted = note_date for any Customer note,
-- which violated the rule that "Skipped" means no contact was attempted.
-- The trigger now skips updating last_contacted for these dismiss-style note types,
-- while still updating next_follow_up_date so the person is removed from Today.

CREATE OR REPLACE FUNCTION public.update_entity_on_note_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  is_dismiss boolean := NEW.note_type IN ('Skipped', 'No Follow-Up Needed');
BEGIN
  IF NEW.entity_type = 'Customer' AND NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET last_contacted = CASE WHEN is_dismiss THEN last_contacted ELSE NEW.note_date END,
        next_follow_up_date = COALESCE(NEW.next_follow_up_date, next_follow_up_date),
        updated_at = now()
    WHERE id = NEW.customer_id;
  ELSIF NEW.entity_type = 'Prospect' AND NEW.prospect_id IS NOT NULL THEN
    UPDATE public.prospects
    SET last_contact_date = CASE WHEN is_dismiss THEN last_contact_date ELSE NEW.note_date END,
        next_follow_up_date = COALESCE(NEW.next_follow_up_date, next_follow_up_date),
        updated_at = now()
    WHERE id = NEW.prospect_id;
  END IF;
  RETURN NEW;
END;
$function$;