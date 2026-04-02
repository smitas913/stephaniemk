CREATE TABLE public.daily_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date date NOT NULL DEFAULT CURRENT_DATE,
  item_type text NOT NULL CHECK (item_type IN ('delivery', 'event')),
  customer_name text NOT NULL DEFAULT '',
  address text,
  notes text,
  event_time text,
  event_location text,
  sort_order integer NOT NULL DEFAULT 0,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view daily plan items"
  ON public.daily_plan_items FOR SELECT TO authenticated
  USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can insert daily plan items"
  ON public.daily_plan_items FOR INSERT TO authenticated
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update daily plan items"
  ON public.daily_plan_items FOR UPDATE TO authenticated
  USING (is_internal_user(auth.uid()))
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete daily plan items"
  ON public.daily_plan_items FOR DELETE TO authenticated
  USING (is_internal_user(auth.uid()));

CREATE INDEX idx_daily_plan_items_date ON public.daily_plan_items (plan_date);