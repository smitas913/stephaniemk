UPDATE storage.buckets SET public = false WHERE id = 'expense-receipts';

DROP POLICY IF EXISTS "Authenticated update contact-cards" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete contact-cards" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload contact-cards" ON storage.objects;

CREATE POLICY "Authenticated upload contact-cards"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contact-cards'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner update contact-cards"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contact-cards'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'contact-cards'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner delete contact-cards"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'contact-cards'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );