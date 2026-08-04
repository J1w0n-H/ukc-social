-- Uploading a profile photo always uses the same <user-id>/avatar.jpg path.
-- The first upload is an INSERT, while every replacement made with upsert is
-- an UPDATE. Keep replacements owner-scoped just like the existing insert
-- policy so users can change their own photo without touching anyone else's.
create policy av_upd on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
