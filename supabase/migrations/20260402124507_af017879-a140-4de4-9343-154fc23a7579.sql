
CREATE TYPE public.expense_category AS ENUM ('Inventory', 'Supplies', 'Marketing', 'Events', 'Tools', 'Other');

CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  category expense_category NOT NULL DEFAULT 'Other',
  notes TEXT,
  owner_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view expenses" ON public.expenses
  FOR SELECT TO authenticated USING (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can insert expenses" ON public.expenses
  FOR INSERT TO authenticated WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can update expenses" ON public.expenses
  FOR UPDATE TO authenticated USING (is_internal_user(auth.uid())) WITH CHECK (is_internal_user(auth.uid()));
CREATE POLICY "Internal users can delete expenses" ON public.expenses
  FOR DELETE TO authenticated USING (is_internal_user(auth.uid()));

CREATE TRIGGER set_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
