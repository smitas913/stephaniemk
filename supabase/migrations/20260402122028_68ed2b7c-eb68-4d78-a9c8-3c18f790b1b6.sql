
CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  note_type text NOT NULL DEFAULT 'General',
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_user_id uuid
);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view customer notes"
  ON public.customer_notes FOR SELECT TO authenticated
  USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can insert customer notes"
  ON public.customer_notes FOR INSERT TO authenticated
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update customer notes"
  ON public.customer_notes FOR UPDATE TO authenticated
  USING (is_internal_user(auth.uid()))
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete customer notes"
  ON public.customer_notes FOR DELETE TO authenticated
  USING (is_internal_user(auth.uid()));

CREATE INDEX idx_customer_notes_customer_id ON public.customer_notes(customer_id);
CREATE INDEX idx_customer_notes_created_at ON public.customer_notes(created_at DESC);
