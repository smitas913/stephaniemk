-- Add editable Date Added field to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS date_added date NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows from created_at (local-ish date)
UPDATE public.customers
SET date_added = (created_at AT TIME ZONE 'UTC')::date
WHERE date_added = CURRENT_DATE AND created_at::date <> CURRENT_DATE;