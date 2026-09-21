ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_cds boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cds_shipping_cost numeric NOT NULL DEFAULT 0;

ALTER TABLE public.financial_settings
  ADD COLUMN IF NOT EXISTS cds_shipping_default numeric NOT NULL DEFAULT 5.95;