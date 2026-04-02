
-- Add new values to expense_category enum
ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'Admin / Office Help';
ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'Accounting';
