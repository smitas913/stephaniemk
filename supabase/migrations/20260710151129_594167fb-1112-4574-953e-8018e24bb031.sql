
CREATE POLICY "Users can view their own customer scans" ON storage.objects FOR SELECT
  USING (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload their own customer scans" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own customer scans" ON storage.objects FOR UPDATE
  USING (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own customer scans" ON storage.objects FOR DELETE
  USING (bucket_id = 'customer-scans' AND auth.uid()::text = (storage.foldername(name))[1]);
