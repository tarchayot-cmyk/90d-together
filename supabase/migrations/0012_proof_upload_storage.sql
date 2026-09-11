-- ============================================================
-- Storage bucket for proof-of-completion uploads (spec: missions
-- with requires_proof = true). Public bucket so getPublicUrl()
-- works without signed URLs — fine for this internal pilot; a
-- larger rollout could switch to private + signed URLs later.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', true)
on conflict (id) do nothing;

-- Members can only upload into a folder named after their own
-- auth.uid() — prevents uploading into someone else's folder.
create policy "proof_upload_own_folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Public bucket: anyone with the link can view (needed so Admin can
-- open the photo from /admin/checkins without extra auth plumbing).
create policy "proof_read_public" on storage.objects
for select
using (bucket_id = 'proofs');
