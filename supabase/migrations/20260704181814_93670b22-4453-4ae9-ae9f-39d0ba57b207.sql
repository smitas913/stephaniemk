
-- 1. Add customers.assigned_consultant_id
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS assigned_consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_assigned_consultant_id ON public.customers(assigned_consultant_id);

-- 2. Merge two consultants — repoints all FKs from dup onto keep, fills empty fields, deletes dup.
CREATE OR REPLACE FUNCTION public.merge_consultants(_keep_id uuid, _dup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _keep record;
  _dup record;
  _moved jsonb := '{}'::jsonb;
  _n int;
BEGIN
  IF _keep_id = _dup_id THEN RAISE EXCEPTION 'Cannot merge a record into itself'; END IF;
  SELECT * INTO _keep FROM public.team_consultants WHERE id = _keep_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Keep consultant % not found', _keep_id; END IF;
  SELECT * INTO _dup FROM public.team_consultants WHERE id = _dup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Duplicate consultant % not found', _dup_id; END IF;

  -- Fill empty fields on keep from dup; merge notes and tags
  UPDATE public.team_consultants SET
    phone = COALESCE(phone, _dup.phone),
    secondary_phone = COALESCE(secondary_phone,
      CASE WHEN _dup.phone IS NOT NULL AND public.normalize_phone(_dup.phone) IS DISTINCT FROM public.normalize_phone(phone) THEN _dup.phone END),
    email = COALESCE(email, _dup.email),
    secondary_email = COALESCE(secondary_email,
      CASE WHEN _dup.email IS NOT NULL AND lower(_dup.email) IS DISTINCT FROM lower(email) THEN _dup.email END),
    first_name = COALESCE(first_name, _dup.first_name),
    last_name = COALESCE(last_name, _dup.last_name),
    consultant_id = COALESCE(consultant_id, _dup.consultant_id),
    birthday = COALESCE(birthday, _dup.birthday),
    birthday_mmdd = COALESCE(birthday_mmdd, _dup.birthday_mmdd),
    address_line_1 = COALESCE(address_line_1, _dup.address_line_1),
    address_line_2 = COALESCE(address_line_2, _dup.address_line_2),
    city = COALESCE(city, _dup.city),
    state_territory = COALESCE(state_territory, _dup.state_territory),
    postal_code = COALESCE(postal_code, _dup.postal_code),
    coaching_focus = COALESCE(coaching_focus, _dup.coaching_focus),
    next_coaching_date = LEAST(COALESCE(next_coaching_date, _dup.next_coaching_date), COALESCE(_dup.next_coaching_date, next_coaching_date)),
    join_date = LEAST(COALESCE(join_date, _dup.join_date), COALESCE(_dup.join_date, join_date)),
    first_order_date = LEAST(COALESCE(first_order_date, _dup.first_order_date), COALESCE(_dup.first_order_date, first_order_date)),
    first_party_date = LEAST(COALESCE(first_party_date, _dup.first_party_date), COALESCE(_dup.first_party_date, first_party_date)),
    debut_date = COALESCE(debut_date, _dup.debut_date),
    last_order_date = GREATEST(last_order_date, _dup.last_order_date),
    last_contacted = GREATEST(last_contacted, _dup.last_contacted),
    notes = CASE
              WHEN _dup.notes IS NULL THEN notes
              WHEN notes IS NULL THEN _dup.notes
              ELSE notes || E'\n\n--- Merged from duplicate consultant record ---\n' || _dup.notes
            END,
    tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}') || COALESCE(_dup.tags,'{}')))),
    beauty_notes = CASE WHEN beauty_notes = '{}'::jsonb OR beauty_notes IS NULL THEN _dup.beauty_notes ELSE beauty_notes || COALESCE(_dup.beauty_notes, '{}'::jsonb) END,
    onboarding_tracker = CASE WHEN onboarding_tracker = '{}'::jsonb OR onboarding_tracker IS NULL THEN _dup.onboarding_tracker ELSE onboarding_tracker || COALESCE(_dup.onboarding_tracker, '{}'::jsonb) END,
    updated_at = now()
  WHERE id = _keep_id;

  -- Repoint all foreign keys
  UPDATE public.orders SET consultant_id = _keep_id WHERE consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('orders', _n);

  UPDATE public.customer_notes SET consultant_id = _keep_id WHERE consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('customer_notes', _n);

  UPDATE public.notes SET person_id = _keep_id WHERE person_type = 'Consultant' AND person_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('notes', _n);

  UPDATE public.daily_plan_items SET consultant_id = _keep_id WHERE consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('daily_plan_items', _n);

  UPDATE public.catalog_campaign_customers SET consultant_id = _keep_id WHERE consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('catalog_campaign_customers', _n);

  UPDATE public.event_guests SET converted_consultant_id = _keep_id WHERE converted_consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('event_guests', _n);

  UPDATE public.event_guests SET consultant_id = _keep_id WHERE consultant_id = _dup_id;

  UPDATE public.booking_leads SET converted_consultant_id = _keep_id WHERE converted_consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('booking_leads', _n);

  UPDATE public.events SET hostess_converted_consultant_id = _keep_id WHERE hostess_converted_consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('events', _n);

  UPDATE public.prospects SET assigned_consultant_id = _keep_id WHERE assigned_consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('prospects', _n);

  UPDATE public.leadership_members SET consultant_id = _keep_id WHERE consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('leadership_members', _n);

  UPDATE public.customers SET assigned_consultant_id = _keep_id WHERE assigned_consultant_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('customers_assigned', _n);

  UPDATE public.completed_birthdays SET person_id = _keep_id WHERE person_type = 'consultant' AND person_id = _dup_id;

  DELETE FROM public.team_consultants WHERE id = _dup_id;

  RETURN jsonb_build_object('keep_id', _keep_id, 'deleted_id', _dup_id, 'moved', _moved);
END;
$$;

-- 3. Merge two customers — same pattern
CREATE OR REPLACE FUNCTION public.merge_customers(_keep_id uuid, _dup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _keep record;
  _dup record;
  _moved jsonb := '{}'::jsonb;
  _n int;
BEGIN
  IF _keep_id = _dup_id THEN RAISE EXCEPTION 'Cannot merge a record into itself'; END IF;
  SELECT * INTO _keep FROM public.customers WHERE id = _keep_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Keep customer % not found', _keep_id; END IF;
  SELECT * INTO _dup FROM public.customers WHERE id = _dup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Duplicate customer % not found', _dup_id; END IF;

  UPDATE public.customers SET
    phone = COALESCE(phone, _dup.phone),
    email = COALESCE(email, _dup.email),
    birthday = COALESCE(birthday, _dup.birthday),
    birthday_mmdd = COALESCE(birthday_mmdd, _dup.birthday_mmdd),
    address_line_1 = COALESCE(address_line_1, _dup.address_line_1),
    address_line_2 = COALESCE(address_line_2, _dup.address_line_2),
    city = COALESCE(city, _dup.city),
    state_territory = COALESCE(state_territory, _dup.state_territory),
    postal_code = COALESCE(postal_code, _dup.postal_code),
    customer_source = COALESCE(customer_source, _dup.customer_source),
    assigned_consultant_id = COALESCE(assigned_consultant_id, _dup.assigned_consultant_id),
    last_contacted = GREATEST(last_contacted, _dup.last_contacted),
    became_customer_date = LEAST(COALESCE(became_customer_date, _dup.became_customer_date), COALESCE(_dup.became_customer_date, became_customer_date)),
    date_added = LEAST(COALESCE(date_added, _dup.date_added), COALESCE(_dup.date_added, date_added)),
    notes = CASE
              WHEN _dup.notes IS NULL THEN notes
              WHEN notes IS NULL THEN _dup.notes
              ELSE notes || E'\n\n--- Merged from duplicate customer record ---\n' || _dup.notes
            END,
    tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}') || COALESCE(_dup.tags,'{}')))),
    beauty_notes = CASE WHEN beauty_notes = '{}'::jsonb OR beauty_notes IS NULL THEN _dup.beauty_notes ELSE beauty_notes || COALESCE(_dup.beauty_notes, '{}'::jsonb) END,
    is_skincare_customer = is_skincare_customer OR _dup.is_skincare_customer,
    skincare_started_at = LEAST(COALESCE(skincare_started_at, _dup.skincare_started_at), COALESCE(_dup.skincare_started_at, skincare_started_at)),
    updated_at = now()
  WHERE id = _keep_id;

  UPDATE public.orders SET customer_id = _keep_id WHERE customer_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('orders', _n);

  UPDATE public.customer_notes SET customer_id = _keep_id WHERE customer_id = _dup_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('customer_notes', _n);

  UPDATE public.notes SET customer_id = _keep_id WHERE customer_id = _dup_id;
  UPDATE public.notes SET person_id = _keep_id WHERE person_type = 'Customer' AND person_id = _dup_id;

  UPDATE public.daily_plan_items SET customer_id = _keep_id WHERE customer_id = _dup_id;
  UPDATE public.catalog_campaign_customers SET customer_id = _keep_id WHERE customer_id = _dup_id;
  UPDATE public.event_guests SET converted_customer_id = _keep_id WHERE converted_customer_id = _dup_id;
  UPDATE public.booking_leads SET converted_customer_id = _keep_id WHERE converted_customer_id = _dup_id;
  UPDATE public.events SET hostess_converted_customer_id = _keep_id WHERE hostess_converted_customer_id = _dup_id;
  UPDATE public.prospects SET customer_id = _keep_id WHERE customer_id = _dup_id;
  UPDATE public.completed_birthdays SET person_id = _keep_id WHERE person_type = 'customer' AND person_id = _dup_id;

  DELETE FROM public.customers WHERE id = _dup_id;

  RETURN jsonb_build_object('keep_id', _keep_id, 'deleted_id', _dup_id, 'moved', _moved);
END;
$$;
