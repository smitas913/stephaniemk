DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.merge_consultants(uuid,uuid)'::regprocedure);
  IF strpos(definition, 'PERFORM public.assert_internal_user();') = 0 THEN
    definition := replace(definition, E'BEGIN\n', E'BEGIN\n  PERFORM public.assert_internal_user();\n');
  END IF;
  EXECUTE definition;
END
$migration$;
REVOKE ALL ON FUNCTION public.merge_consultants(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_consultants(uuid,uuid) TO authenticated, service_role;