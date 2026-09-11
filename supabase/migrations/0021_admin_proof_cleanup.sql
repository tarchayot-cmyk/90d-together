-- ============================================================
-- Manual proof-photo cleanup (Admin-triggered, not automatic)
-- Only ever targets check_ins with proof_status IN ('approved',
-- 'rejected') — pending items are never touched, since the photo is
-- still needed for review.
-- ============================================================

-- 1. Allow admins to delete files from the 'proofs' bucket.
-- (Upload/read policies from 0012 are untouched — this only adds
-- DELETE, which didn't exist before.)
create policy "proof_delete_admin_only" on storage.objects
for delete to authenticated
using (
  bucket_id = 'proofs'
  and exists (
    select 1 from members
    where auth_user_id = auth.uid() and role in ('admin', 'super_admin')
  )
);

-- 2. admin_clear_proof_urls() — call this AFTER the actual files
-- have been removed from storage (via supabase.storage.remove() on
-- the client) to null out the now-dangling proof_url references.
-- Never touches 'pending' rows even if a caller passes their id.
create or replace function admin_clear_proof_urls(p_checkin_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_count int;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  update check_ins
    set proof_url = null
    where id = any(p_checkin_ids)
      and proof_status in ('approved', 'rejected');

  get diagnostics v_count = row_count;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (
    v_admin_id, 'other', 'proof_cleanup', null,
    jsonb_build_object('cleared_count', v_count)
  );

  return jsonb_build_object('success', true, 'cleared_count', v_count);
end;
$$;

grant execute on function admin_clear_proof_urls(uuid[]) to authenticated;
