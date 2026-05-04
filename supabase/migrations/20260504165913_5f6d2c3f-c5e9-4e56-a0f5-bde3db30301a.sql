
-- Phone normalization: store raw 10-digit (strip leading 1)
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(p, '\D', '', 'g');
  IF length(d) = 11 AND left(d, 1) = '1' THEN
    d := substr(d, 2);
  END IF;
  IF d = '' THEN RETURN NULL; END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'customers' THEN
    NEW.phone := public.normalize_phone(NEW.phone);
  ELSIF TG_TABLE_NAME = 'team_consultants' THEN
    NEW.phone := public.normalize_phone(NEW.phone);
    IF NEW.secondary_phone IS NOT NULL THEN
      NEW.secondary_phone := public.normalize_phone(NEW.secondary_phone);
    END IF;
  ELSIF TG_TABLE_NAME = 'prospects' THEN
    NEW.phone := public.normalize_phone(NEW.phone);
  ELSIF TG_TABLE_NAME = 'booking_leads' THEN
    NEW.phone := public.normalize_phone(NEW.phone);
  ELSIF TG_TABLE_NAME = 'event_guests' THEN
    NEW.phone := public.normalize_phone(NEW.phone);
  ELSIF TG_TABLE_NAME = 'events' THEN
    IF NEW.hostess_phone IS NOT NULL THEN
      NEW.hostess_phone := public.normalize_phone(NEW.hostess_phone);
    END IF;
  ELSIF TG_TABLE_NAME = 'leadership_members' THEN
    NEW.phone := public.normalize_phone(NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_phone_customers ON public.customers;
CREATE TRIGGER trg_normalize_phone_customers BEFORE INSERT OR UPDATE OF phone ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_columns();

DROP TRIGGER IF EXISTS trg_normalize_phone_team_consultants ON public.team_consultants;
CREATE TRIGGER trg_normalize_phone_team_consultants BEFORE INSERT OR UPDATE OF phone, secondary_phone ON public.team_consultants
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_columns();

DROP TRIGGER IF EXISTS trg_normalize_phone_prospects ON public.prospects;
CREATE TRIGGER trg_normalize_phone_prospects BEFORE INSERT OR UPDATE OF phone ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_columns();

DROP TRIGGER IF EXISTS trg_normalize_phone_booking_leads ON public.booking_leads;
CREATE TRIGGER trg_normalize_phone_booking_leads BEFORE INSERT OR UPDATE OF phone ON public.booking_leads
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_columns();

DROP TRIGGER IF EXISTS trg_normalize_phone_event_guests ON public.event_guests;
CREATE TRIGGER trg_normalize_phone_event_guests BEFORE INSERT OR UPDATE OF phone ON public.event_guests
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_columns();

DROP TRIGGER IF EXISTS trg_normalize_phone_events ON public.events;
CREATE TRIGGER trg_normalize_phone_events BEFORE INSERT OR UPDATE OF hostess_phone ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_columns();

DROP TRIGGER IF EXISTS trg_normalize_phone_leadership_members ON public.leadership_members;
CREATE TRIGGER trg_normalize_phone_leadership_members BEFORE INSERT OR UPDATE OF phone ON public.leadership_members
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_columns();

-- Backfill existing rows
UPDATE public.customers SET phone = public.normalize_phone(phone) WHERE phone IS NOT NULL AND phone <> public.normalize_phone(phone);
UPDATE public.team_consultants SET phone = public.normalize_phone(phone) WHERE phone IS NOT NULL AND phone <> public.normalize_phone(phone);
UPDATE public.team_consultants SET secondary_phone = public.normalize_phone(secondary_phone) WHERE secondary_phone IS NOT NULL AND secondary_phone <> public.normalize_phone(secondary_phone);
UPDATE public.prospects SET phone = public.normalize_phone(phone) WHERE phone IS NOT NULL AND phone <> public.normalize_phone(phone);
UPDATE public.booking_leads SET phone = public.normalize_phone(phone) WHERE phone IS NOT NULL AND phone <> public.normalize_phone(phone);
UPDATE public.event_guests SET phone = public.normalize_phone(phone) WHERE phone IS NOT NULL AND phone <> public.normalize_phone(phone);
UPDATE public.events SET hostess_phone = public.normalize_phone(hostess_phone) WHERE hostess_phone IS NOT NULL AND hostess_phone <> public.normalize_phone(hostess_phone);
UPDATE public.leadership_members SET phone = public.normalize_phone(phone) WHERE phone IS NOT NULL AND phone <> public.normalize_phone(phone);
