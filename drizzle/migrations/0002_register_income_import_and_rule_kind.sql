-- Income: statement-import support
ALTER TABLE public.income
  ADD COLUMN IF NOT EXISTS import_fingerprint text,
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS income_owner_fingerprint_idx
  ON public.income (owner_user_id, import_fingerprint);

-- Merchant rules: separate expense vs income memory
ALTER TABLE public.expense_merchant_rules
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expense';

UPDATE public.expense_merchant_rules SET kind = 'expense' WHERE kind IS NULL OR kind = '';

ALTER TABLE public.expense_merchant_rules
  DROP CONSTRAINT IF EXISTS expense_merchant_rules_owner_user_id_merchant_key_key;

DROP INDEX IF EXISTS expense_merchant_rules_owner_merchant_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS expense_merchant_rules_owner_merchant_kind_uniq
  ON public.expense_merchant_rules (owner_user_id, merchant_key, kind);