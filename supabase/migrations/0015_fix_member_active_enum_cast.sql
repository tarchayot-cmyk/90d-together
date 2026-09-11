-- ============================================================
-- Fix: admin_set_member_active() has the same bug as 0013/0014 —
--   column "action" is of type audit_action but expression is of type text
-- `case when p_is_active then 'other' else 'deactivate_member' end`
-- resolves to plain text; added an explicit ::audit_action cast.
-- Everything else is unchanged from 0008.
-- ============================================================

create or replace function admin_set_member_active(
  p_member_id uuid,
  p_is_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_active boolean;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select is_active into v_old_active from members where id = p_member_id;
  if v_old_active is null then
    raise exception 'member_not_found';
  end if;

  update members set is_active = p_is_active where id = p_member_id;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id,
    (case when p_is_active then 'other' else 'deactivate_member' end)::audit_action,
    'member', p_member_id,
    jsonb_build_object('is_active', v_old_active),
    jsonb_build_object('is_active', p_is_active)
  );

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_set_member_active(uuid, boolean) to authenticated;
