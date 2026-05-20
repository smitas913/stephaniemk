CREATE OR REPLACE FUNCTION public.convert_person(_from_type text, _from_id uuid, _overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _moved jsonb := '{}'::jsonb;
  _src record;
  _archive jsonb;
BEGIN
  IF _from_type = 'customer' THEN
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
    SELECT * INTO _src FROM public.team_consultants WHERE id = _from_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consultant % not found', _from_id; END IF;

    _archive := jsonb_build_object(
      'former_consultant_id', _src.consultant_id,
      'join_date', _src.join_date,
      'status', _src.status,
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

    UPDATE public.leadership_members SET consultant_id = NULL WHERE consultant_id = _from_id;
    UPDATE public.prospects SET assigned_consultant_id = NULL WHERE assigned_consultant_id = _from_id;

    DELETE FROM public.team_consultants WHERE id = _from_id;

    RETURN jsonb_build_object('new_id', _new_id, 'to_type', 'customer', 'moved', _moved);
  ELSE
    RAISE EXCEPTION 'Invalid _from_type: %', _from_type;
  END IF;
END;
$function$;