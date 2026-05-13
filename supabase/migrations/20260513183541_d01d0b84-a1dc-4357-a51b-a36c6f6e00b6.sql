
ALTER TABLE public.booking_leads ADD COLUMN IF NOT EXISTS contact_card_photo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-cards', 'contact-cards', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read contact-cards"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contact-cards');

CREATE POLICY "Authenticated upload contact-cards"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contact-cards');

CREATE POLICY "Authenticated update contact-cards"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contact-cards');

CREATE POLICY "Authenticated delete contact-cards"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contact-cards');
