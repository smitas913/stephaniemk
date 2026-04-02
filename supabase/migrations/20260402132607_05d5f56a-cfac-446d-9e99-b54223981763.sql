
-- Add receipt_url column to expenses
ALTER TABLE public.expenses ADD COLUMN receipt_url text;

-- Create storage bucket for expense receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts', 'expense-receipts', true);

-- Storage RLS: internal users can upload
CREATE POLICY "Internal users can upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'expense-receipts' AND is_internal_user(auth.uid()));

-- Storage RLS: internal users can view
CREATE POLICY "Internal users can view receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'expense-receipts' AND is_internal_user(auth.uid()));

-- Storage RLS: internal users can delete
CREATE POLICY "Internal users can delete receipts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'expense-receipts' AND is_internal_user(auth.uid()));
