-- ============================================================
-- 1. Track who reviewed each check-in, when, and why (for rejections)
-- ============================================================
alter table check_ins add column if not exists reviewed_by uuid references members (id);
alter table check_ins add column if not exists reviewed_at timestamptz;
alter table check_ins add column if not exists rejection_reason text;

-- ------------------------------------------------------------
-- 2. admin_approve_checkin() — adds p_reason (new trailing param
-- with a default, so CREATE OR REPLACE works without a DROP).
-- Records reviewed_by/reviewed_at on every review, and
-- rejection_reason + includes it in the member's notification when
-- rejecting.
-- ------------------------------------------------------------
create or replace function admin_approve_checkin(
  p_checkin_id uuid,
  p_approved boolean,
  p_reason text default null
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

  if v_checkin.member_id = v_admin_id then
    raise exception 'cannot_approve_own_submission';
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

    update check_ins set
      proof_status = v_new_status,
      completed_at = now(),
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      rejection_reason = null
    where id = p_checkin_id;

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
    update check_ins set
      proof_status = v_new_status,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      rejection_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_checkin_id;

    begin
      perform create_notification(
        v_checkin.member_id,
        'checkin_rejected',
        'ภารกิจ "' || v_mission.name || '" ของคุณไม่ผ่านการตรวจสอบหลักฐาน'
          || case when p_reason is not null and trim(p_reason) <> '' then ' เหตุผล: ' || trim(p_reason) else '' end
          || ' — ลองส่งใหม่อีกครั้งได้เลย',
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
    jsonb_build_object('proof_status', v_new_status, 'reason', p_reason)
  );

  return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;
