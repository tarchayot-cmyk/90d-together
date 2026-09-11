-- ============================================================
-- Fix: Supabase Auth (GoTrue) returns 500 on login when certain
-- auth.users token columns are NULL instead of empty string ''.
-- Our admin_create_member() INSERT didn't set them explicitly, so
-- they landed as NULL. This fixes the already-created account(s)
-- and re-declares admin_create_member()/it won't happen again.
-- ============================================================

-- 1. Fix every existing account created via admin_create_member()
--    (safe to run even if some of these were already fine).
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email like '%@employee.growtogether.local';

-- 2. Re-declare admin_create_member() to set these explicitly from
--    now on, so future accounts don't hit the same bug.
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
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(p_pin, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"employee_code","providers":["employee_code"]}'::jsonb,
    jsonb_build_object('employee_code', p_employee_code, 'full_name', p_full_name),
    '', '', '', '', '', '', '', ''
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
