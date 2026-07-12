
-- 1. catalog_campaigns: owner scoping
DROP POLICY IF EXISTS "Internal users can view catalog campaigns" ON public.catalog_campaigns;
DROP POLICY IF EXISTS "Internal users can insert catalog campaigns" ON public.catalog_campaigns;
DROP POLICY IF EXISTS "Internal users can update catalog campaigns" ON public.catalog_campaigns;
DROP POLICY IF EXISTS "Internal users can delete catalog campaigns" ON public.catalog_campaigns;

CREATE POLICY "Internal users can view catalog campaigns" ON public.catalog_campaigns
FOR SELECT TO authenticated
USING (is_internal_user(auth.uid()) AND (has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

CREATE POLICY "Internal users can insert catalog campaigns" ON public.catalog_campaigns
FOR INSERT TO authenticated
WITH CHECK (is_internal_user(auth.uid()) AND (has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

CREATE POLICY "Internal users can update catalog campaigns" ON public.catalog_campaigns
FOR UPDATE TO authenticated
USING (is_internal_user(auth.uid()) AND (has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()))
WITH CHECK (is_internal_user(auth.uid()) AND (has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

CREATE POLICY "Internal users can delete catalog campaigns" ON public.catalog_campaigns
FOR DELETE TO authenticated
USING (is_internal_user(auth.uid()) AND (has_any_active_role(auth.uid()) OR owner_user_id = auth.uid()));

-- 2. contact-cards storage: read scoped to uploader's folder (owners/admins bypass)
DROP POLICY IF EXISTS "Internal users read contact-cards" ON storage.objects;
CREATE POLICY "Internal users read contact-cards" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'contact-cards'
  AND is_internal_user(auth.uid())
  AND (
    has_any_active_role(auth.uid())
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- 3. expense-receipts storage: scope to owner of related expense (owners/admins bypass)
DROP POLICY IF EXISTS "Internal users can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Internal users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Internal users can delete receipts" ON storage.objects;

CREATE POLICY "Internal users can view receipts" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND is_internal_user(auth.uid())
  AND (
    has_any_active_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.receipt_url = storage.objects.name
        AND e.owner_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Internal users can upload receipts" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND is_internal_user(auth.uid())
);

CREATE POLICY "Internal users can delete receipts" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND is_internal_user(auth.uid())
  AND (
    has_any_active_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.receipt_url = storage.objects.name
        AND e.owner_user_id = auth.uid()
    )
  )
);

-- 4. customer-scans storage: retarget public -> authenticated
DROP POLICY IF EXISTS "Users can view their own customer scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own customer scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own customer scans" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own customer scans" ON storage.objects;

CREATE POLICY "Users can view their own customer scans" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own customer scans" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own customer scans" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own customer scans" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);
