
-- Campaign instances table
CREATE TABLE public.catalog_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type text NOT NULL,
  mailing_date date NOT NULL,
  notes text,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.catalog_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view catalog campaigns" ON public.catalog_campaigns FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert catalog campaigns" ON public.catalog_campaigns FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update catalog campaigns" ON public.catalog_campaigns FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete catalog campaigns" ON public.catalog_campaigns FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));

-- Campaign-customer junction table
CREATE TABLE public.catalog_campaign_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.catalog_campaigns(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  follow_up_date date,
  follow_up_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, customer_id)
);

ALTER TABLE public.catalog_campaign_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view campaign customers" ON public.catalog_campaign_customers FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert campaign customers" ON public.catalog_campaign_customers FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update campaign customers" ON public.catalog_campaign_customers FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete campaign customers" ON public.catalog_campaign_customers FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));
