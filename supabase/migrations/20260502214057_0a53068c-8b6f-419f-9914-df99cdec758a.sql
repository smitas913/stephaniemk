
-- Financial tracking fields on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cc_fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_received numeric;

-- Per-user financial defaults
CREATE TABLE IF NOT EXISTS public.financial_settings (
  user_id uuid PRIMARY KEY,
  tax_rate numeric NOT NULL DEFAULT 0,
  cc_fee_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own financial settings"
  ON public.financial_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own financial settings"
  ON public.financial_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own financial settings"
  ON public.financial_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_financial_settings_updated_at
  BEFORE UPDATE ON public.financial_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
