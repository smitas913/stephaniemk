ALTER FUNCTION public.convert_person(text, uuid, jsonb) RENAME TO convert_person_impl;
ALTER FUNCTION public.merge_customer_into_consultant(uuid, uuid) RENAME TO merge_customer_into_consultant_impl;

REVOKE ALL ON FUNCTION public.convert_person_impl(text, uuid, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.merge_customer_into_consultant_impl(uuid, uuid) FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.convert_person(_from_type text, _from_id uuid, _overrides jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_internal_user(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN public.convert_person_impl(_from_type, _from_id, _overrides);
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_customer_into_consultant(_customer_id uuid, _consultant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_internal_user(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN public.merge_customer_into_consultant_impl(_customer_id, _consultant_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_person(text, uuid, jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.merge_customer_into_consultant(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_person(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_customer_into_consultant(uuid, uuid) TO authenticated;