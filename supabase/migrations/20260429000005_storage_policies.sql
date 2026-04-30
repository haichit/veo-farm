INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload to own folder" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own files" ON storage.objects FOR SELECT
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own files" ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
