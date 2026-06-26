
DROP POLICY IF EXISTS "Public read contact-cards" ON storage.objects;

CREATE POLICY "Internal users read contact-cards"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contact-cards'
  AND public.is_internal_user(auth.uid())
);
