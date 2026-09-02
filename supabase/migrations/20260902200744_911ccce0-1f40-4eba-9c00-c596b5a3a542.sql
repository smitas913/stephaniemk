-- 1. No anonymous / PUBLIC execution of any privileged routine
REVOKE ALL ON FUNCTION public.check_profile_update_safe(uuid, app_role, boolean) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.has_any_active_role(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.is_internal_user(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.convert_person(text, uuid, jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.merge_consultants(uuid, uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.merge_customer_into_consultant(uuid, uuid) FROM anon, PUBLIC;

-- 2. Merge routines that the app never calls: internal / service use only
REVOKE ALL ON FUNCTION public.merge_consultants(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.merge_customers(uuid, uuid) FROM authenticated;

-- 3. Role guard inside the two routines the app does call
CREATE OR REPLACE FUNCTION public.assert_internal_user()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_internal_user(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_internal_user() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_internal_user() TO authenticated;