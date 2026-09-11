-- ============================================================
-- Fix: same bug as 0013/0014/0015 — a `case when ... then 'x' else
-- 'y' end` feeding into an enum column resolves to plain `text`,
-- which has no implicit cast to a custom enum on UPDATE. Adding
-- explicit ::invitation_status casts. Everything else in both
-- functions is unchanged from 0022.
-- ============================================================

create or replace function respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_inv activity_invitations%rowtype;
  v_mission missions%rowtype;
  v_to_name text;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv from activity_invitations where id = p_invitation_id;
  if v_inv.id is null then
    raise exception 'invitation_not_found';
  end if;
  if v_inv.to_member_id <> v_member_id then
    raise exception 'not_authorized';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_not_pending';
  end if;

  select * into v_mission from missions where id = v_inv.mission_id;
  select full_name into v_to_name from members where id = v_member_id;

  update activity_invitations
    set status = (case when p_accept then 'accepted' else 'declined' end)::invitation_status,
        responded_at = now()
    where id = p_invitation_id;

  begin
    perform create_notification(
      v_inv.from_member_id,
      (case when p_accept then 'activity_accepted' else 'activity_declined' end)::notification_type,
      v_to_name || (case when p_accept then ' ตอบรับ' else ' ไม่สะดวก' end) ||
        'คำชวนทำภารกิจ "' || v_mission.name || '"',
      '/invitations',
      jsonb_build_object('invitation_id', p_invitation_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function respond_to_invitation(uuid, boolean) to authenticated;

create or replace function respond_to_counter(p_invitation_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_inv activity_invitations%rowtype;
  v_mission missions%rowtype;
  v_from_name text;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv from activity_invitations where id = p_invitation_id;
  if v_inv.id is null then
    raise exception 'invitation_not_found';
  end if;
  if v_inv.from_member_id <> v_member_id then
    raise exception 'not_authorized';
  end if;
  if v_inv.status <> 'countered' then
    raise exception 'invitation_not_countered';
  end if;

  if v_inv.counter_expires_at < now() then
    update activity_invitations set status = 'expired'::invitation_status where id = p_invitation_id;
    raise exception 'counter_expired';
  end if;

  update activity_invitations
    set status = (case when p_accept then 'accepted' else 'declined' end)::invitation_status,
        scheduled_at = case when p_accept then counter_scheduled_at else scheduled_at end,
        responded_at = now()
    where id = p_invitation_id;

  select * into v_mission from missions where id = v_inv.mission_id;
  select full_name into v_from_name from members where id = v_member_id;

  begin
    perform create_notification(
      v_inv.to_member_id,
      (case when p_accept then 'activity_accepted' else 'activity_declined' end)::notification_type,
      v_from_name || (case when p_accept then ' ตอบรับ' else ' ไม่รับ' end) ||
        'ข้อเสนอเวลาใหม่สำหรับภารกิจ "' || v_mission.name || '"',
      '/invitations',
      jsonb_build_object('invitation_id', p_invitation_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function respond_to_counter(uuid, boolean) to authenticated;
