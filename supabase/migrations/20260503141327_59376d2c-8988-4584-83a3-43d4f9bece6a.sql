
CREATE TABLE public.discount_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.discount_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own discount types"
ON public.discount_types FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users insert own discount types"
ON public.discount_types FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own discount types"
ON public.discount_types FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own discount types"
ON public.discount_types FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_discount_types_updated_at
BEFORE UPDATE ON public.discount_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN discount_type_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];
