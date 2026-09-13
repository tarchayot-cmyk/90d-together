-- ============================================================
-- Make the invitation's scheduled date/time optional. Column stays
-- as-is otherwise; just drops the NOT NULL constraint.
-- ============================================================
alter table activity_invitations alter column scheduled_at drop not null;

-- Same param names/types/order as before, just adding a default to
-- p_scheduled_at — CREATE OR REPLACE allows this without a DROP.
create or replace function create_invitation(
  p_to_member_id uuid,
  p_mission_id uuid,
  p_scheduled_at timestamptz default null,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_member_id uuid;
  v_from_name text;
  v_mission missions%rowtype;
  v_invitation_id uuid;
  v_notification_message text;
begin
  v_from_member_id := auth_member_id();
  if v_from_member_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_to_member_id = v_from_member_id then
    raise exception 'cannot_invite_self';
  end if;
  if p_scheduled_at is not null and p_scheduled_at < now() then
    raise exception 'scheduled_time_in_past';
  end if;

  select * into v_mission from missions where id = p_mission_id and is_active = true;
  if v_mission.id is null then
    raise exception 'mission_not_found';
  end if;

  select full_name into v_from_name from members where id = v_from_member_id;

  insert into activity_invitations (mission_id, from_member_id, to_member_id, scheduled_at, message)
  values (p_mission_id, v_from_member_id, p_to_member_id, p_scheduled_at, p_message)
  returning id into v_invitation_id;

  v_notification_message := v_from_name || ' ชวนคุณทำภารกิจ "' || v_mission.name || '"'
    || case when p_scheduled_at is not null then ' วันที่ ' || to_char(p_scheduled_at, 'DD Mon YYYY HH24:MI') else '' end;

  begin
    perform create_notification(
      p_to_member_id,
      'activity_invited',
      v_notification_message,
      '/invitations',
      jsonb_build_object('invitation_id', v_invitation_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true, 'invitation_id', v_invitation_id);
end;
$$;
