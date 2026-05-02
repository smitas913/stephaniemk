
-- 1. Add tags to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_customers_tags ON public.customers USING GIN(tags);

-- 2. Soft-cancel columns
ALTER TABLE public.daily_plan_items
  ADD COLUMN IF NOT EXISTS is_canceled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

ALTER TABLE public.event_tasks
  ADD COLUMN IF NOT EXISTS is_canceled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

-- 3. Migrate booking_leads → customers + 'Lead' tag
DO $$
DECLARE
  rec RECORD;
  cid uuid;
BEGIN
  FOR rec IN SELECT * FROM public.booking_leads WHERE converted_customer_id IS NULL LOOP
    SELECT id INTO cid FROM public.customers
    WHERE owner_user_id IS NOT DISTINCT FROM rec.owner_user_id
      AND (
        (rec.phone IS NOT NULL AND phone = rec.phone)
        OR (rec.email IS NOT NULL AND lower(email) = lower(rec.email))
      )
    LIMIT 1;

    IF cid IS NULL THEN
      INSERT INTO public.customers (
        full_name, phone, email, address_line_1, city, state_territory, postal_code,
        notes, owner_user_id, last_contacted, next_follow_up_date,
        allow_non_working_day, tags, date_added
      ) VALUES (
        rec.name, rec.phone, rec.email, rec.address_line_1, rec.city, rec.state_territory, rec.postal_code,
        rec.notes, rec.owner_user_id, rec.last_contact_date, rec.next_follow_up_date,
        rec.allow_non_working_day, ARRAY['Lead']::text[], COALESCE(rec.created_at::date, CURRENT_DATE)
      ) RETURNING id INTO cid;
    ELSE
      UPDATE public.customers
      SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags || ARRAY['Lead']::text[])))
      WHERE id = cid;
    END IF;
  END LOOP;
END $$;

-- Existing converted leads: also tag the customer
UPDATE public.customers c
SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(c.tags || ARRAY['Lead']::text[])))
FROM public.booking_leads b
WHERE b.converted_customer_id = c.id
  AND NOT ('Lead' = ANY(c.tags));

-- 4. Migrate prospects → customers + 'Prospect' tag
DO $$
DECLARE
  rec RECORD;
  cid uuid;
BEGIN
  FOR rec IN SELECT * FROM public.prospects LOOP
    cid := rec.customer_id;

    IF cid IS NULL THEN
      SELECT id INTO cid FROM public.customers
      WHERE owner_user_id IS NOT DISTINCT FROM rec.owner_user_id
        AND (
          (rec.phone IS NOT NULL AND phone = rec.phone)
          OR (rec.email IS NOT NULL AND lower(email) = lower(rec.email))
        )
      LIMIT 1;
    END IF;

    IF cid IS NULL THEN
      INSERT INTO public.customers (
        full_name, phone, email, address_line_1, city, state_territory, postal_code,
        notes, owner_user_id, last_contacted, next_follow_up_date,
        allow_non_working_day, tags, date_added
      ) VALUES (
        rec.name, rec.phone, rec.email, rec.address_line_1, rec.city, rec.state_territory, rec.postal_code,
        rec.notes, rec.owner_user_id, rec.last_contact_date, rec.next_follow_up_date,
        rec.allow_non_working_day, ARRAY['Prospect']::text[], COALESCE(rec.created_at::date, CURRENT_DATE)
      ) RETURNING id INTO cid;
    ELSE
      UPDATE public.customers
      SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags || ARRAY['Prospect']::text[])))
      WHERE id = cid;
    END IF;
  END LOOP;
END $$;

-- 5. Trigger: when Face order logged, remove 'Lead' tag
CREATE OR REPLACE FUNCTION public.remove_lead_tag_on_face()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.face_type IS NOT NULL AND NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET tags = array_remove(tags, 'Lead'),
        updated_at = now()
    WHERE id = NEW.customer_id AND 'Lead' = ANY(tags);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_lead_tag_on_face ON public.orders;
CREATE TRIGGER trg_remove_lead_tag_on_face
AFTER INSERT OR UPDATE OF face_type ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.remove_lead_tag_on_face();

-- 6. Trigger: enforce DNC immediately on customers (soft-cancel)
CREATE OR REPLACE FUNCTION public.enforce_dnc_on_customer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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

    UPDATE public.event_tasks et
    SET is_canceled = true, canceled_at = now()
    WHERE et.is_completed = false
      AND et.is_canceled = false
      AND (et.due_date IS NULL OR et.due_date >= CURRENT_DATE)
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.event_id = et.event_id
          AND e.hostess_name = NEW.full_name
          AND e.owner_user_id IS NOT DISTINCT FROM NEW.owner_user_id
      );

    UPDATE public.catalog_campaign_customers
    SET follow_up_completed = true
    WHERE customer_id = NEW.id
      AND follow_up_completed = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_dnc_on_customer ON public.customers;
CREATE TRIGGER trg_enforce_dnc_on_customer
BEFORE UPDATE OF tags ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.enforce_dnc_on_customer();
