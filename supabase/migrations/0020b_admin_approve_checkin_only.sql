create or replace function admin_approve_checkin(
  p_checkin_id uuid,
  p_approved boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_checkin check_ins%rowtype;
  v_mission missions%rowtype;
  v_new_status text;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_admin_id := auth_member_id();

  select * into v_checkin from check_ins where id = p_checkin_id;
  if v_checkin.id is null then
    raise exception 'checkin_not_found';
  end if;

  select * into v_mission from missions where id = v_checkin.mission_id;

  if not v_mission.requires_proof then
    raise exception 'proof_not_required';
  end if;

  if v_checkin.proof_status <> 'pending' then
    raise exception 'already_reviewed';
  end if;

  if p_approved then
    v_new_status := 'approved';

    update check_ins set proof_status = v_new_status, completed_at = now() where id = p_checkin_id;

    insert into points_transactions (member_id, points, source, source_ref_id)
    values (v_checkin.member_id, v_mission.points, 'mission', v_checkin.id);

    if v_mission.sticker_color is not null and v_mission.sticker_amount > 0 then
      insert into stickers (member_id, color, amount, source, source_ref_id)
      values (v_checkin.member_id, v_mission.sticker_color, v_mission.sticker_amount, 'mission', v_checkin.id);
    end if;

    perform check_achievements(v_checkin.member_id);

    begin
      perform create_notification(
        v_checkin.member_id,
        'checkin_approved',
        'ภารกิจ "' || v_mission.name || '" ของคุณได้รับการอนุมัติแล้ว ได้รับ +' || v_mission.points || ' คะแนน 🎉',
        '/missions',
        jsonb_build_object('check_in_id', p_checkin_id, 'mission_id', v_mission.id)
      );
    exception when others then
      null;
    end;
  else
    v_new_status := 'rejected';
    update check_ins set proof_status = v_new_status where id = p_checkin_id;

    begin
      perform create_notification(
        v_checkin.member_id,
        'checkin_rejected',
        'ภารกิจ "' || v_mission.name || '" ของคุณไม่ผ่านการตรวจสอบหลักฐาน ลองส่งใหม่อีกครั้งได้เลย',
        '/missions',
        jsonb_build_object('check_in_id', p_checkin_id, 'mission_id', v_mission.id)
      );
    exception when others then
      null;
    end;
  end if;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id,
    (case when p_approved then 'approve_checkin' else 'reject_checkin' end)::audit_action,
    'check_in', p_checkin_id,
    jsonb_build_object('proof_status', 'pending'),
    jsonb_build_object('proof_status', v_new_status)
  );

  return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;

grant execute on function admin_approve_checkin(uuid, boolean) to authenticated;

-- Verify right away — both should say true now.
select
  position('checkin_rejected' in prosrc) > 0 as function_has_reject_notification_code,
  position('checkin_approved' in prosrc) > 0 as function_has_approve_notification_code
from pg_proc
where proname = 'admin_approve_checkin';
