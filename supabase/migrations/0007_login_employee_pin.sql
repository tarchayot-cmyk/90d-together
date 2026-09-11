-- ============================================================
-- 90 Days Growing Together — Login (Employee Code + PIN) Migration
-- Depends on Sprints 1-6 (pgcrypto already enabled in 0001).
-- Run once, top to bottom, in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- Why this needs SQL at all
--
-- Supabase Auth's client SDK only speaks email+password (or OTP/OAuth).
-- To get "Employee Code + PIN" (spec section 5) without standing up a
-- custom auth server, each employee code is mapped to a synthetic,
-- never-emailed address (`<code>@employee.growtogether.local` — see
-- src/lib/auth.ts) and the PIN is stored as that account's password,
-- using the exact same bcrypt hashing Supabase's own GoTrue auth
-- server uses (via pgcrypto's crypt()/gen_salt('bf')). No separate
-- "pins" table is needed -- auth.users.encrypted_password already
-- *is* the hashed PIN.
--
-- Writing directly to auth.users bypasses GoTrue's own signup flow
-- (email verification, rate limiting, etc.), which is fine for an
-- internal, admin-provisioned pilot but is NOT how you'd want to
-- onboard the general public. Keep member provisioning admin-only.
-- ============================================================

-- ============================================================
-- 1. admin_create_member()
--
-- Creates both the auth.users row (with the PIN as its bcrypt
-- password) and the linked members row in one transaction.
--
-- Bootstrap rule: if the members table is completely empty, this can
-- be called without being an admin (there's no admin yet to call it!)
-- -- but it's only grantable to the `authenticated` role below, not
-- `anon`, so in practice you run that very first call yourself from
-- the SQL Editor (which executes as postgres and bypasses grants
-- entirely), not from the public app. Every call after the first
-- member exists requires is_admin() = true.
-- ============================================================
create or replace function admin_create_member(
  p_employee_code text,
  p_full_name text,
  p_pin text,
  p_department text default null,
  p_role member_role default 'participant'
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_existing_members int;
  v_email text;
  v_auth_id uuid := gen_random_uuid();
  v_member_id uuid;
begin
  select count(*) into v_existing_members from members;
  if v_existing_members > 0 and not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_pin is null or length(p_pin) < 4 then
    raise exception 'pin_too_short';
  end if;

  if exists (select 1 from members where employee_code = p_employee_code) then
    raise exception 'employee_code_already_exists';
  end if;

  v_email := lower(trim(p_employee_code)) || '@employee.growtogether.local';

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(p_pin, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"employee_code","providers":["employee_code"]}'::jsonb,
    jsonb_build_object('employee_code', p_employee_code, 'full_name', p_full_name)
  );

  insert into members (auth_user_id, employee_code, full_name, department, role, is_active)
  values (v_auth_id, p_employee_code, p_full_name, p_department, p_role, true)
  returning id into v_member_id;

  if v_existing_members > 0 then
    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (
      auth_member_id(), 'other', 'member', v_member_id,
      jsonb_build_object('created_employee_code', p_employee_code, 'role', p_role)
    );
  end if;

  return jsonb_build_object('success', true, 'member_id', v_member_id, 'login_email', v_email);
end;
$$;

grant execute on function admin_create_member(text, text, text, text, member_role) to authenticated;

-- ============================================================
-- 2. admin_reset_pin()  -- for when someone forgets their PIN
-- ============================================================
create or replace function admin_reset_pin(p_member_id uuid, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_auth_user_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_new_pin is null or length(p_new_pin) < 4 then
    raise exception 'pin_too_short';
  end if;

  select auth_user_id into v_auth_user_id from members where id = p_member_id;
  if v_auth_user_id is null then
    raise exception 'member_not_found_or_no_login';
  end if;

  update auth.users
    set encrypted_password = crypt(p_new_pin, gen_salt('bf')), updated_at = now()
    where id = v_auth_user_id;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (auth_member_id(), 'other', 'member_pin_reset', p_member_id, jsonb_build_object('reset_by_admin', true));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_reset_pin(uuid, text) to authenticated;

-- ============================================================
-- 3. Bootstrap your first admin -- run this ONE line yourself,
-- right here in the SQL Editor, replacing the placeholder values.
-- (Commented out so re-running this migration file doesn't try to
-- create a duplicate account.)
-- ============================================================
-- select admin_create_member('EMP001', 'ผู้ดูแลระบบ', '123456', 'IT', 'super_admin');
