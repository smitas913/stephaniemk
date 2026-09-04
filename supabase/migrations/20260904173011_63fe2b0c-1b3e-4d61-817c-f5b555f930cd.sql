DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'convert_person_impl';
  d := regexp_replace(d, E'\n[^\n]*booking_leads[^\n]*', '', 'g');
  EXECUTE d;

  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'merge_customers';
  d := regexp_replace(d, E'\n[^\n]*booking_leads[^\n]*', '', 'g');
  EXECUTE d;
END $$;

ALTER TABLE public.events DROP COLUMN IF EXISTS hostess_lead_id;

DROP TABLE IF EXISTS public.booking_leads CASCADE;

DROP TYPE IF EXISTS public.booking_lead_status;