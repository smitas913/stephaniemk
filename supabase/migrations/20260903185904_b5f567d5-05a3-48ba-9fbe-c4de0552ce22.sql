-- Unused SECURITY DEFINER helpers: not referenced by any RLS policy and not
-- called from the app. Remove direct EXECUTE access for API roles.
REVOKE ALL ON FUNCTION public.assert_internal_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_internal_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;