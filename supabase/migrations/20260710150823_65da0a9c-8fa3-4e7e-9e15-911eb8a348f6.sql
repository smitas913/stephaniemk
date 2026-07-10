
-- Helper predicate pattern used below:
--   is_internal_user(auth.uid()) AND (has_any_active_role(auth.uid()) OR owner_user_id = auth.uid())
-- has_any_active_role() = owner/admin bypass; consultants must own the row.

-- booking_leads
DROP POLICY IF EXISTS "Internal users can view booking leads" ON public.booking_leads;
DROP POLICY IF EXISTS "Internal users can insert booking leads" ON public.booking_leads;
DROP POLICY IF EXISTS "Internal users can update booking leads" ON public.booking_leads;
DROP POLICY IF EXISTS "Internal users can delete booking leads" ON public.booking_leads;
CREATE POLICY "Internal users can view booking leads" ON public.booking_leads FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert booking leads" ON public.booking_leads FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update booking leads" ON public.booking_leads FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete booking leads" ON public.booking_leads FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- customer_notes
DROP POLICY IF EXISTS "Internal users can view customer notes" ON public.customer_notes;
DROP POLICY IF EXISTS "Internal users can insert customer notes" ON public.customer_notes;
DROP POLICY IF EXISTS "Internal users can update customer notes" ON public.customer_notes;
DROP POLICY IF EXISTS "Internal users can delete customer notes" ON public.customer_notes;
CREATE POLICY "Internal users can view customer notes" ON public.customer_notes FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert customer notes" ON public.customer_notes FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update customer notes" ON public.customer_notes FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete customer notes" ON public.customer_notes FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- daily_plan_items
DROP POLICY IF EXISTS "Internal users can view daily plan items" ON public.daily_plan_items;
DROP POLICY IF EXISTS "Internal users can insert daily plan items" ON public.daily_plan_items;
DROP POLICY IF EXISTS "Internal users can update daily plan items" ON public.daily_plan_items;
DROP POLICY IF EXISTS "Internal users can delete daily plan items" ON public.daily_plan_items;
CREATE POLICY "Internal users can view daily plan items" ON public.daily_plan_items FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert daily plan items" ON public.daily_plan_items FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update daily plan items" ON public.daily_plan_items FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete daily plan items" ON public.daily_plan_items FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- event_guests
DROP POLICY IF EXISTS "Internal users can view event guests" ON public.event_guests;
DROP POLICY IF EXISTS "Internal users can insert event guests" ON public.event_guests;
DROP POLICY IF EXISTS "Internal users can update event guests" ON public.event_guests;
DROP POLICY IF EXISTS "Internal users can delete event guests" ON public.event_guests;
CREATE POLICY "Internal users can view event guests" ON public.event_guests FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert event guests" ON public.event_guests FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update event guests" ON public.event_guests FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete event guests" ON public.event_guests FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- event_tasks
DROP POLICY IF EXISTS "Internal users can view event tasks" ON public.event_tasks;
DROP POLICY IF EXISTS "Internal users can insert event tasks" ON public.event_tasks;
DROP POLICY IF EXISTS "Internal users can update event tasks" ON public.event_tasks;
DROP POLICY IF EXISTS "Internal users can delete event tasks" ON public.event_tasks;
CREATE POLICY "Internal users can view event tasks" ON public.event_tasks FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert event tasks" ON public.event_tasks FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update event tasks" ON public.event_tasks FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete event tasks" ON public.event_tasks FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- expenses
DROP POLICY IF EXISTS "Internal users can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Internal users can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Internal users can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Internal users can delete expenses" ON public.expenses;
CREATE POLICY "Internal users can view expenses" ON public.expenses FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert expenses" ON public.expenses FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update expenses" ON public.expenses FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete expenses" ON public.expenses FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- income
DROP POLICY IF EXISTS "Internal users can view income" ON public.income;
DROP POLICY IF EXISTS "Internal users can insert income" ON public.income;
DROP POLICY IF EXISTS "Internal users can update income" ON public.income;
DROP POLICY IF EXISTS "Internal users can delete income" ON public.income;
CREATE POLICY "Internal users can view income" ON public.income FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert income" ON public.income FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update income" ON public.income FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete income" ON public.income FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- leadership_members
DROP POLICY IF EXISTS "Internal users can view leadership members" ON public.leadership_members;
DROP POLICY IF EXISTS "Internal users can insert leadership members" ON public.leadership_members;
DROP POLICY IF EXISTS "Internal users can update leadership members" ON public.leadership_members;
DROP POLICY IF EXISTS "Internal users can delete leadership members" ON public.leadership_members;
CREATE POLICY "Internal users can view leadership members" ON public.leadership_members FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert leadership members" ON public.leadership_members FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update leadership members" ON public.leadership_members FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete leadership members" ON public.leadership_members FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- notes
DROP POLICY IF EXISTS "Internal users can view notes" ON public.notes;
DROP POLICY IF EXISTS "Internal users can insert notes" ON public.notes;
DROP POLICY IF EXISTS "Internal users can update notes" ON public.notes;
DROP POLICY IF EXISTS "Internal users can delete notes" ON public.notes;
CREATE POLICY "Internal users can view notes" ON public.notes FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert notes" ON public.notes FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update notes" ON public.notes FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete notes" ON public.notes FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- prospect_notes
DROP POLICY IF EXISTS "Internal users can view prospect notes" ON public.prospect_notes;
DROP POLICY IF EXISTS "Internal users can insert prospect notes" ON public.prospect_notes;
DROP POLICY IF EXISTS "Internal users can update prospect notes" ON public.prospect_notes;
DROP POLICY IF EXISTS "Internal users can delete prospect notes" ON public.prospect_notes;
CREATE POLICY "Internal users can view prospect notes" ON public.prospect_notes FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert prospect notes" ON public.prospect_notes FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update prospect notes" ON public.prospect_notes FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete prospect notes" ON public.prospect_notes FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- prospects
DROP POLICY IF EXISTS "Internal users can view prospects" ON public.prospects;
DROP POLICY IF EXISTS "Internal users can insert prospects" ON public.prospects;
DROP POLICY IF EXISTS "Internal users can update prospects" ON public.prospects;
DROP POLICY IF EXISTS "Internal users can delete prospects" ON public.prospects;
CREATE POLICY "Internal users can view prospects" ON public.prospects FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert prospects" ON public.prospects FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update prospects" ON public.prospects FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete prospects" ON public.prospects FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- team_consultants
DROP POLICY IF EXISTS "Internal users can view team consultants" ON public.team_consultants;
DROP POLICY IF EXISTS "Internal users can insert team consultants" ON public.team_consultants;
DROP POLICY IF EXISTS "Internal users can update team consultants" ON public.team_consultants;
DROP POLICY IF EXISTS "Internal users can delete team consultants" ON public.team_consultants;
CREATE POLICY "Internal users can view team consultants" ON public.team_consultants FOR SELECT
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can insert team consultants" ON public.team_consultants FOR INSERT
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can update team consultants" ON public.team_consultants FOR UPDATE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
  WITH CHECK (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));
CREATE POLICY "Internal users can delete team consultants" ON public.team_consultants FOR DELETE
  USING (public.is_internal_user(auth.uid()) AND (public.has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- catalog_campaign_customers (scoped by parent campaign owner)
DROP POLICY IF EXISTS "Internal users can view campaign customers" ON public.catalog_campaign_customers;
DROP POLICY IF EXISTS "Internal users can insert campaign customers" ON public.catalog_campaign_customers;
DROP POLICY IF EXISTS "Internal users can update campaign customers" ON public.catalog_campaign_customers;
DROP POLICY IF EXISTS "Internal users can delete campaign customers" ON public.catalog_campaign_customers;
CREATE POLICY "Internal users can view campaign customers" ON public.catalog_campaign_customers FOR SELECT
  USING (
    public.is_internal_user(auth.uid()) AND (
      public.has_any_active_role(auth.uid())
      OR EXISTS (SELECT 1 FROM public.catalog_campaigns c WHERE c.id = catalog_campaign_customers.campaign_id AND c.owner_user_id = auth.uid())
    )
  );
CREATE POLICY "Internal users can insert campaign customers" ON public.catalog_campaign_customers FOR INSERT
  WITH CHECK (
    public.is_internal_user(auth.uid()) AND (
      public.has_any_active_role(auth.uid())
      OR EXISTS (SELECT 1 FROM public.catalog_campaigns c WHERE c.id = catalog_campaign_customers.campaign_id AND c.owner_user_id = auth.uid())
    )
  );
CREATE POLICY "Internal users can update campaign customers" ON public.catalog_campaign_customers FOR UPDATE
  USING (
    public.is_internal_user(auth.uid()) AND (
      public.has_any_active_role(auth.uid())
      OR EXISTS (SELECT 1 FROM public.catalog_campaigns c WHERE c.id = catalog_campaign_customers.campaign_id AND c.owner_user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.is_internal_user(auth.uid()) AND (
      public.has_any_active_role(auth.uid())
      OR EXISTS (SELECT 1 FROM public.catalog_campaigns c WHERE c.id = catalog_campaign_customers.campaign_id AND c.owner_user_id = auth.uid())
    )
  );
CREATE POLICY "Internal users can delete campaign customers" ON public.catalog_campaign_customers FOR DELETE
  USING (
    public.is_internal_user(auth.uid()) AND (
      public.has_any_active_role(auth.uid())
      OR EXISTS (SELECT 1 FROM public.catalog_campaigns c WHERE c.id = catalog_campaign_customers.campaign_id AND c.owner_user_id = auth.uid())
    )
  );
