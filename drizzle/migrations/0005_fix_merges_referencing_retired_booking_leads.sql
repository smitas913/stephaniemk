DO $migration$
DECLARE
  routine regprocedure;
  definition text;
BEGIN
  FOREACH routine IN ARRAY ARRAY[
    'public.merge_consultants(uuid,uuid)'::regprocedure,
    'public.merge_customer_into_consultant_impl(uuid,uuid)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(routine);
    -- Remove only the retired table update and its adjacent row-count report.
    definition := regexp_replace(definition, E'\n[^\n]*UPDATE public\\.booking_leads[^\n]*\n', E'\n', 'g');
    definition := regexp_replace(definition, E'\n[^\n]*GET DIAGNOSTICS[^\n]*booking_leads[^\n]*\n', E'\n', 'g');
    EXECUTE definition;
  END LOOP;
END
$migration$;