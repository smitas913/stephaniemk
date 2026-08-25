DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{public}'
      AND tablename IN ('booking_leads','team_consultants','prospect_notes','daily_plan_items','expenses','leadership_members','event_guests','income','customer_notes','notes','prospects','catalog_campaign_customers')
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.policyname, r.tablename);
  END LOOP;
END $$;

REVOKE ALL ON public.booking_leads, public.team_consultants, public.prospect_notes, public.daily_plan_items, public.expenses, public.leadership_members, public.event_guests, public.income, public.customer_notes, public.notes, public.prospects, public.catalog_campaign_customers FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_leads, public.team_consultants, public.prospect_notes, public.daily_plan_items, public.expenses, public.leadership_members, public.event_guests, public.income, public.customer_notes, public.notes, public.prospects, public.catalog_campaign_customers TO authenticated;
GRANT ALL ON public.booking_leads, public.team_consultants, public.prospect_notes, public.daily_plan_items, public.expenses, public.leadership_members, public.event_guests, public.income, public.customer_notes, public.notes, public.prospects, public.catalog_campaign_customers TO service_role;