
-- Enum for income categories (commissions, bonuses, etc.)
CREATE TYPE public.income_category AS ENUM ('Commission', 'Bonus', 'Referral', 'Other');

-- Flexible income table for future streams
CREATE TABLE public.income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  category income_category NOT NULL DEFAULT 'Commission',
  source text NULL,
  notes text NULL,
  owner_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NULL DEFAULT now()
);

ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view income" ON public.income FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert income" ON public.income FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update income" ON public.income FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete income" ON public.income FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));
