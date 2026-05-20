REVOKE EXECUTE ON FUNCTION public.convert_person(text, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_customer_into_consultant(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.convert_person(text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_customer_into_consultant(uuid, uuid) TO authenticated;