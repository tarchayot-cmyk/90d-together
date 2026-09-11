-- ============================================================
-- Admin: undo a mistaken check-in
-- Reverses the points_transactions + stickers rows that
-- complete_mission()/admin_approve_checkin() created for this
-- check-in, then deletes the check-in itself so the member can
-- redo that mission for the same week. Fully audited.
--
-- Known limitation: does not revoke any badge (member_badges) that
-- may have been unlocked partly because of this check-in — badges
-- are left as-is. Manually review /admin/audit if that matters for
-- a specific case.
-- ============================================================
create or replace function admin_delete_checkin(p_checkin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_checkin check_ins%rowtype;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select * into v_checkin from check_ins where id = p_checkin_id;
  if v_checkin.id is null then
    raise exception 'checkin_not_found';
  end if;

  delete from points_transactions where source = 'mission' and source_ref_id = v_checkin.id;
  delete from stickers where source = 'mission' and source_ref_id = v_checkin.id;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (v_admin_id, 'other', 'check_in', p_checkin_id, to_jsonb(v_checkin), null);

  delete from check_ins where id = p_checkin_id;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_delete_checkin(uuid) to authenticated;
