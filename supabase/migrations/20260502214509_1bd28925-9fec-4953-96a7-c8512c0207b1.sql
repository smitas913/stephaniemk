
ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS profit_margin_rate numeric NOT NULL DEFAULT 50;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS net_profit numeric;
