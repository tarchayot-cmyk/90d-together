-- ============================================================
-- TASK 12 — Permission & Security Audit
-- Finding: neither admin_approve_checkin() nor admin_review_proposal()
-- checked whether the target belongs to the calling admin themselves.
-- Since role is a single value per member, an admin/super_admin
-- account can also submit check-ins or proposals like any
-- participant — without this guard, they could approve/reject their
-- own submission. Fixed by adding one explicit self-check to each;
-- everything else in both functions is unchanged from their live
-- versions (0020b and 0024 respectively).
-- ============================================================

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

  -- NEW: conflict-of-interest guard.
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

create or replace function admin_review_proposal(p_proposal_id uuid, p_approved boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_prop activity_proposals%rowtype;
  v_new_status proposal_status;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select * into v_prop from activity_proposals where id = p_proposal_id;
  if v_prop.id is null then
    raise exception 'proposal_not_found';
  end if;

  -- NEW: conflict-of-interest guard.
  if v_prop.proposed_by = v_admin_id then
    raise exception 'cannot_approve_own_submission';
  end if;

  if v_prop.status <> 'pending' then
    raise exception 'proposal_not_pending';
  end if;

  v_new_status := (case when p_approved then 'approved' else 'rejected' end)::proposal_status;

  update activity_proposals
    set status = v_new_status, reviewed_by = v_admin_id, reviewed_at = now()
    where id = p_proposal_id;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'activity_proposal', p_proposal_id, jsonb_build_object('status', v_new_status));

  begin
    perform create_notification(
      v_prop.proposed_by,
      (case when p_approved then 'proposal_approved' else 'proposal_rejected' end)::notification_type,
      'ข้อเสนอกิจกรรม "' || v_prop.title || '" ของคุณ' ||
        (case when p_approved then 'ได้รับการอนุมัติแล้ว 🎉' else 'ไม่ได้รับการอนุมัติในครั้งนี้' end),
      '/proposals',
      jsonb_build_object('proposal_id', p_proposal_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;

grant execute on function admin_review_proposal(uuid, boolean) to authenticated;
