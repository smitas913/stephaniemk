-- ============================================================
-- Migration A: schema for Customer ↔ Consultant true conversion
-- ============================================================

-- 1. team_consultants: add columns to mirror customers
ALTER TABLE public.team_consultants
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS beauty_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS birthday_mmdd text,
  ADD COLUMN IF NOT EXISTS is_skincare_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skincare_started_at date,
  ADD COLUMN IF NOT EXISTS customer_source text,
  ADD COLUMN IF NOT EXISTS new_customer_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attention_reason text,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contacted date,
  ADD COLUMN IF NOT EXISTS became_customer_date date,
  ADD COLUMN IF NOT EXISTS date_added date,
  ADD COLUMN IF NOT EXISTS next_follow_up_date date,
  ADD COLUMN IF NOT EXISTS follow_up_reason text,
  ADD COLUMN IF NOT EXISTS new_follow_up_stage text,
  ADD COLUMN IF NOT EXISTS dormant_follow_up_stage text,
  ADD COLUMN IF NOT EXISTS former_consultant_data jsonb;

-- 2. customers: archive slot for consultant-specific data when converted back
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS former_consultant_data jsonb;

-- 3. orders: add consultant_id + constraint exactly one of {customer, consultant}
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ALTER COLUMN customer_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_xor_consultant'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_xor_consultant
      CHECK ((customer_id IS NOT NULL)::int + (consultant_id IS NOT NULL)::int = 1);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_orders_consultant_id ON public.orders(consultant_id);

-- 4. Related tables: add nullable consultant_id
ALTER TABLE public.customer_notes
  ADD COLUMN IF NOT EXISTS consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE CASCADE;
ALTER TABLE public.customer_notes ALTER COLUMN customer_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_notes_consultant_id ON public.customer_notes(consultant_id);

ALTER TABLE public.daily_plan_items
  ADD COLUMN IF NOT EXISTS consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_daily_plan_items_consultant_id ON public.daily_plan_items(consultant_id);

ALTER TABLE public.catalog_campaign_customers
  ADD COLUMN IF NOT EXISTS consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE CASCADE;
ALTER TABLE public.catalog_campaign_customers ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS converted_consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL;

ALTER TABLE public.booking_leads
  ADD COLUMN IF NOT EXISTS converted_consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hostess_converted_consultant_id uuid REFERENCES public.team_consultants(id) ON DELETE SET NULL;

-- 5. Update last-order trigger to handle the consultant branch
CREATE OR REPLACE FUNCTION public.update_customer_last_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _cid uuid;
  _consid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _cid := OLD.customer_id;
    _consid := OLD.consultant_id;
  ELSE
    _cid := NEW.customer_id;
    _consid := NEW.consultant_id;
  END IF;

  IF _cid IS NOT NULL THEN
    UPDATE public.customers SET
      last_order_date_order_log = (SELECT MAX(order_date) FROM public.orders WHERE customer_id = _cid),
      updated_at = now()
    WHERE id = _cid;
  END IF;

  IF _consid IS NOT NULL THEN
    UPDATE public.team_consultants SET
      last_order_date = (SELECT MAX(order_date) FROM public.orders WHERE consultant_id = _consid),
      updated_at = now()
    WHERE id = _consid;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- 6. Transactional conversion RPC
-- Moves a person from customers <-> team_consultants, re-points all FKs,
-- archives type-specific fields, then deletes the source row. Single transaction.
CREATE OR REPLACE FUNCTION public.convert_person(
  _from_type text,    -- 'customer' or 'consultant'
  _from_id uuid,
  _overrides jsonb DEFAULT '{}'::jsonb  -- optional field overrides on the target
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_id uuid;
  _moved jsonb := '{}'::jsonb;
  _src record;
  _archive jsonb;
BEGIN
  IF _from_type = 'customer' THEN
    -- customer -> consultant
    SELECT * INTO _src FROM public.customers WHERE id = _from_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer % not found', _from_id; END IF;

    INSERT INTO public.team_consultants (
      name, first_name, last_name, phone, secondary_phone, email, secondary_email,
      birthday, birthday_mmdd, address_line_1, address_line_2, city, state_territory, postal_code,
      notes, owner_user_id, status, join_date,
      tags, beauty_notes,
      is_skincare_customer, skincare_started_at, customer_source, new_customer_flag,
      needs_attention, attention_reason, flagged_at,
      last_contacted, became_customer_date, date_added,
      next_follow_up_date, follow_up_reason, new_follow_up_stage, dormant_follow_up_stage,
      former_consultant_data,
      allow_non_working_day, relationship_type
    ) VALUES (
      COALESCE(_overrides->>'name', _src.full_name),
      NULL, NULL,
      _src.phone, NULL,
      _src.email, NULL,
      _src.birthday, _src.birthday_mmdd,
      _src.address_line_1, _src.address_line_2, _src.city, _src.state_territory, _src.postal_code,
      _src.notes, _src.owner_user_id, 'Active', CURRENT_DATE,
      _src.tags, _src.beauty_notes,
      _src.is_skincare_customer, _src.skincare_started_at, _src.customer_source, _src.new_customer_flag,
      _src.needs_attention, _src.attention_reason, _src.flagged_at,
      _src.last_contacted, _src.became_customer_date, _src.date_added,
      _src.next_follow_up_date, _src.follow_up_reason, _src.new_follow_up_stage, _src.dormant_follow_up_stage,
      _src.former_consultant_data,
      _src.allow_non_working_day, 'Personal Recruit'
    ) RETURNING id INTO _new_id;

    UPDATE public.orders SET consultant_id = _new_id, customer_id = NULL WHERE customer_id = _from_id;
    GET DIAGNOSTICS _moved = ROW_COUNT;
    _moved := jsonb_build_object('orders', _moved::int);

    UPDATE public.customer_notes SET consultant_id = _new_id, customer_id = NULL WHERE customer_id = _from_id;
    _moved := _moved || jsonb_build_object('customer_notes', (SELECT count(*)::int FROM public.customer_notes WHERE consultant_id = _new_id));

    UPDATE public.notes SET person_type = 'Consultant', person_id = _new_id, customer_id = NULL
      WHERE customer_id = _from_id OR (person_type = 'Customer' AND person_id = _from_id);

    UPDATE public.daily_plan_items SET consultant_id = _new_id, customer_id = NULL WHERE customer_id = _from_id;

    UPDATE public.catalog_campaign_customers SET consultant_id = _new_id, customer_id = NULL WHERE customer_id = _from_id;

    UPDATE public.event_guests SET converted_consultant_id = _new_id, converted_customer_id = NULL WHERE converted_customer_id = _from_id;

    UPDATE public.booking_leads SET converted_consultant_id = _new_id, converted_customer_id = NULL WHERE converted_customer_id = _from_id;

    UPDATE public.events SET hostess_converted_consultant_id = _new_id, hostess_converted_customer_id = NULL WHERE hostess_converted_customer_id = _from_id;

    UPDATE public.completed_birthdays SET person_type = 'consultant', person_id = _new_id WHERE person_type = 'customer' AND person_id = _from_id;

    DELETE FROM public.customers WHERE id = _from_id;

    RETURN jsonb_build_object('new_id', _new_id, 'to_type', 'consultant', 'moved', _moved);

  ELSIF _from_type = 'consultant' THEN
    -- consultant -> customer
    SELECT * INTO _src FROM public.team_consultants WHERE id = _from_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consultant % not found', _from_id; END IF;

    -- archive consultant-specific fields
    _archive := jsonb_build_object(
      'join_date', _src.join_date,
      'status', _src.status,
      'consultant_id_number', _src.consultant_id,
      'onboarding_stage', _src.onboarding_stage,
      'coaching_focus', _src.coaching_focus,
      'first_order_date', _src.first_order_date,
      'first_party_date', _src.first_party_date,
      'first_team_member_date', _src.first_team_member_date,
      'focus_group', _src.focus_group,
      'relationship_type', _src.relationship_type,
      'prospect_id', _src.prospect_id,
      'last_order_date', _src.last_order_date,
      'archived_at', now()
    );

    INSERT INTO public.customers (
      full_name, phone, email, birthday, birthday_mmdd,
      address_line_1, address_line_2, city, state_territory, postal_code,
      notes, owner_user_id, relationship_status, date_added,
      tags, beauty_notes,
      is_skincare_customer, skincare_started_at, customer_source, new_customer_flag,
      needs_attention, attention_reason, flagged_at,
      last_contacted, became_customer_date,
      next_follow_up_date, follow_up_reason, new_follow_up_stage, dormant_follow_up_stage,
      former_consultant_data, allow_non_working_day, is_active
    ) VALUES (
      _src.name, _src.phone, _src.email, _src.birthday, _src.birthday_mmdd,
      _src.address_line_1, _src.address_line_2, _src.city, _src.state_territory, _src.postal_code,
      _src.notes, _src.owner_user_id, 'Customer', COALESCE(_src.date_added, CURRENT_DATE),
      _src.tags, _src.beauty_notes,
      _src.is_skincare_customer, _src.skincare_started_at, _src.customer_source, _src.new_customer_flag,
      _src.needs_attention, _src.attention_reason, _src.flagged_at,
      _src.last_contacted, _src.became_customer_date,
      _src.next_follow_up_date, _src.follow_up_reason, _src.new_follow_up_stage, _src.dormant_follow_up_stage,
      _archive, _src.allow_non_working_day, true
    ) RETURNING id INTO _new_id;

    UPDATE public.orders SET customer_id = _new_id, consultant_id = NULL WHERE consultant_id = _from_id;
    GET DIAGNOSTICS _moved = ROW_COUNT;
    _moved := jsonb_build_object('orders', _moved::int);

    UPDATE public.customer_notes SET customer_id = _new_id, consultant_id = NULL WHERE consultant_id = _from_id;
    UPDATE public.notes SET person_type = 'Customer', person_id = _new_id, customer_id = _new_id
      WHERE person_type = 'Consultant' AND person_id = _from_id;
    UPDATE public.daily_plan_items SET customer_id = _new_id, consultant_id = NULL WHERE consultant_id = _from_id;
    UPDATE public.catalog_campaign_customers SET customer_id = _new_id, consultant_id = NULL WHERE consultant_id = _from_id;
    UPDATE public.event_guests SET converted_customer_id = _new_id, converted_consultant_id = NULL WHERE converted_consultant_id = _from_id;
    UPDATE public.booking_leads SET converted_customer_id = _new_id, converted_consultant_id = NULL WHERE converted_consultant_id = _from_id;
    UPDATE public.events SET hostess_converted_customer_id = _new_id, hostess_converted_consultant_id = NULL WHERE hostess_converted_consultant_id = _from_id;
    UPDATE public.completed_birthdays SET person_type = 'customer', person_id = _new_id WHERE person_type = 'consultant' AND person_id = _from_id;

    -- detach related side-tables before delete
    UPDATE public.leadership_members SET consultant_id = NULL WHERE consultant_id = _from_id;
    UPDATE public.prospects SET assigned_consultant_id = NULL WHERE assigned_consultant_id = _from_id;

    DELETE FROM public.team_consultants WHERE id = _from_id;

    RETURN jsonb_build_object('new_id', _new_id, 'to_type', 'customer', 'moved', _moved);
  ELSE
    RAISE EXCEPTION 'Invalid _from_type: %', _from_type;
  END IF;
END;
$$;

-- 7. Merge-into-existing-consultant RPC (for the 16-pair backfill)
-- Moves all FKs from a customer onto an EXISTING consultant, fills missing fields, deletes the customer.
CREATE OR REPLACE FUNCTION public.merge_customer_into_consultant(
  _customer_id uuid,
  _consultant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _c record;
  _t record;
  _moved jsonb := '{}'::jsonb;
  _n int;
BEGIN
  SELECT * INTO _c FROM public.customers WHERE id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer % not found', _customer_id; END IF;
  SELECT * INTO _t FROM public.team_consultants WHERE id = _consultant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultant % not found', _consultant_id; END IF;

  -- Fill gaps on consultant from customer; append notes; merge tags
  UPDATE public.team_consultants SET
    phone = COALESCE(phone, _c.phone),
    email = COALESCE(email, _c.email),
    secondary_phone = CASE WHEN _c.phone IS NOT NULL AND public.normalize_phone(_c.phone) IS DISTINCT FROM public.normalize_phone(phone) AND secondary_phone IS NULL THEN _c.phone ELSE secondary_phone END,
    secondary_email = CASE WHEN _c.email IS NOT NULL AND lower(_c.email) IS DISTINCT FROM lower(email) AND secondary_email IS NULL THEN _c.email ELSE secondary_email END,
    birthday = COALESCE(birthday, _c.birthday),
    birthday_mmdd = COALESCE(birthday_mmdd, _c.birthday_mmdd),
    address_line_1 = COALESCE(address_line_1, _c.address_line_1),
    address_line_2 = COALESCE(address_line_2, _c.address_line_2),
    city = COALESCE(city, _c.city),
    state_territory = COALESCE(state_territory, _c.state_territory),
    postal_code = COALESCE(postal_code, _c.postal_code),
    notes = CASE
              WHEN _c.notes IS NULL THEN notes
              WHEN notes IS NULL THEN _c.notes
              ELSE notes || E'\n\n--- Merged from customer record ---\n' || _c.notes
            END,
    tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}') || COALESCE(_c.tags,'{}')))),
    beauty_notes = CASE WHEN beauty_notes = '{}'::jsonb THEN _c.beauty_notes ELSE beauty_notes || _c.beauty_notes END,
    is_skincare_customer = is_skincare_customer OR _c.is_skincare_customer,
    skincare_started_at = COALESCE(skincare_started_at, _c.skincare_started_at),
    customer_source = COALESCE(customer_source, _c.customer_source),
    last_contacted = GREATEST(last_contacted, _c.last_contacted),
    became_customer_date = LEAST(COALESCE(became_customer_date, _c.became_customer_date), COALESCE(_c.became_customer_date, became_customer_date)),
    date_added = LEAST(COALESCE(date_added, _c.date_added), COALESCE(_c.date_added, date_added)),
    next_follow_up_date = COALESCE(next_follow_up_date, _c.next_follow_up_date),
    follow_up_reason = COALESCE(follow_up_reason, _c.follow_up_reason),
    new_follow_up_stage = COALESCE(new_follow_up_stage, _c.new_follow_up_stage),
    dormant_follow_up_stage = COALESCE(dormant_follow_up_stage, _c.dormant_follow_up_stage),
    needs_attention = needs_attention OR _c.needs_attention,
    attention_reason = COALESCE(attention_reason, _c.attention_reason),
    flagged_at = COALESCE(flagged_at, _c.flagged_at),
    updated_at = now()
  WHERE id = _consultant_id;

  UPDATE public.orders SET consultant_id = _consultant_id, customer_id = NULL WHERE customer_id = _customer_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('orders', _n);

  UPDATE public.customer_notes SET consultant_id = _consultant_id, customer_id = NULL WHERE customer_id = _customer_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('customer_notes', _n);

  UPDATE public.notes SET person_type = 'Consultant', person_id = _consultant_id, customer_id = NULL
    WHERE customer_id = _customer_id OR (person_type = 'Customer' AND person_id = _customer_id);
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('notes', _n);

  UPDATE public.daily_plan_items SET consultant_id = _consultant_id, customer_id = NULL WHERE customer_id = _customer_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('daily_plan_items', _n);

  UPDATE public.catalog_campaign_customers SET consultant_id = _consultant_id, customer_id = NULL WHERE customer_id = _customer_id;
  GET DIAGNOSTICS _n = ROW_COUNT; _moved := _moved || jsonb_build_object('catalog_campaign_customers', _n);

  UPDATE public.event_guests SET converted_consultant_id = _consultant_id, converted_customer_id = NULL WHERE converted_customer_id = _customer_id;
  UPDATE public.booking_leads SET converted_consultant_id = _consultant_id, converted_customer_id = NULL WHERE converted_customer_id = _customer_id;
  UPDATE public.events SET hostess_converted_consultant_id = _consultant_id, hostess_converted_customer_id = NULL WHERE hostess_converted_customer_id = _customer_id;
  UPDATE public.completed_birthdays SET person_type = 'consultant', person_id = _consultant_id WHERE person_type = 'customer' AND person_id = _customer_id;

  DELETE FROM public.customers WHERE id = _customer_id;

  RETURN jsonb_build_object('consultant_id', _consultant_id, 'moved', _moved);
END;
$$;