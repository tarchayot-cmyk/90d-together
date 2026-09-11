-- ============================================================
-- TASK 6 — Member form: full name, nickname, unit, profile picture
-- All schema changes are additive (nullable new columns) — no
-- existing member data is touched or lost.
-- ============================================================

-- 1. New columns
alter table members add column if not exists nickname text;
alter table members add column if not exists unit text
  check (unit in ('Chemo', 'TPN', 'IV admixture', 'ผลิตยาทั่วไป', 'Extem'));
alter table members add column if not exists avatar_url text;

-- 2. Storage bucket for profile pictures (same pattern as the
-- 'proofs' bucket from earlier — public bucket, upload/update/delete
-- restricted to the member's own folder).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar_upload_own_folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar_update_own_folder" on storage.objects
for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar_delete_own_folder" on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar_read_public" on storage.objects
for select using (bucket_id = 'avatars');

-- ============================================================
-- 3. admin_update_member_details() — Admin edits an EXISTING
-- member's name/nickname/unit. Does not touch employee_code, role,
-- is_active, or department — those stay managed by their existing
-- dedicated controls (admin_set_member_active(), etc.).
-- ============================================================
create or replace function admin_update_member_details(
  p_member_id uuid,
  p_full_name text,
  p_nickname text default null,
  p_unit text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_value jsonb;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full_name_required';
  end if;
  if p_unit is not null and p_unit not in ('Chemo', 'TPN', 'IV admixture', 'ผลิตยาทั่วไป', 'Extem') then
    raise exception 'invalid_unit';
  end if;

  select jsonb_build_object('full_name', full_name, 'nickname', nickname, 'unit', unit)
    into v_old_value
    from members where id = p_member_id;

  if v_old_value is null then
    raise exception 'member_not_found';
  end if;

  update members
    set full_name = trim(p_full_name),
        nickname = nullif(trim(coalesce(p_nickname, '')), ''),
        unit = p_unit
    where id = p_member_id;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id, 'other', 'member', p_member_id,
    v_old_value,
    jsonb_build_object('full_name', p_full_name, 'nickname', p_nickname, 'unit', p_unit)
  );

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_update_member_details(uuid, text, text, text) to authenticated;

-- ============================================================
-- 4. update_my_avatar() — a member can only ever change their own
-- avatar_url, nothing else. Deliberately narrow (no general members
-- UPDATE policy for self, which would let a member edit their own
-- role/employee_code/is_active too).
-- ============================================================
create or replace function update_my_avatar(p_avatar_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  update members set avatar_url = p_avatar_url where id = v_member_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function update_my_avatar(text) to authenticated;
