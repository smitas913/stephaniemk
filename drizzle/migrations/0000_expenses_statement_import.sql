ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS import_fingerprint text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS receipt_not_required boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS expenses_import_fingerprint_idx ON public.expenses (owner_user_id, import_fingerprint);

CREATE TABLE IF NOT EXISTS public.expense_merchant_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  merchant_key text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_merchant_rules_owner_key_unique UNIQUE (owner_user_id, merchant_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_merchant_rules TO authenticated;
GRANT ALL ON public.expense_merchant_rules TO service_role;

ALTER TABLE public.expense_merchant_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners select own merchant rules" ON public.expense_merchant_rules;
CREATE POLICY "Owners select own merchant rules" ON public.expense_merchant_rules
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners insert own merchant rules" ON public.expense_merchant_rules;
CREATE POLICY "Owners insert own merchant rules" ON public.expense_merchant_rules
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners update own merchant rules" ON public.expense_merchant_rules;
CREATE POLICY "Owners update own merchant rules" ON public.expense_merchant_rules
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners delete own merchant rules" ON public.expense_merchant_rules;
CREATE POLICY "Owners delete own merchant rules" ON public.expense_merchant_rules
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());