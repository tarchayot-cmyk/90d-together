-- ============================================================
-- TASK 2 — Activity Invitations
-- "กิจกรรม" = an existing mission (missions.id) — no separate
-- activity table. Reuses list_colleagues() and notification_type
-- from Task 1 as-is (4 values already reserved: activity_invited,
-- activity_accepted, activity_declined, activity_counter_proposed).
-- ============================================================

create type invitation_status as enum ('pending', 'countered', 'accepted', 'declined', 'expired');

create table activity_invitations (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  from_member_id uuid not null references members (id) on delete cascade,
  to_member_id uuid not null references members (id) on delete cascade,
  scheduled_at timestamptz not null,
  message text,
  status invitation_status not null default 'pending',
  counter_scheduled_at timestamptz,
  counter_message text,
  counter_expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

create index idx_invitations_to on activity_invitations (to_member_id, status);
create index idx_invitations_from on activity_invitations (from_member_id, status);

alter table activity_invitations enable row level security;

create policy invitations_select_involved on activity_invitations
  for select using (from_member_id = auth_member_id() or to_member_id = auth_member_id() or is_admin());

revoke insert, update, delete on activity_invitations from authenticated;

-- ============================================================
-- 1. create_invitation() — inviter picks colleague + mission + time
-- ============================================================
create or replace function create_invitation(
  p_to_member_id uuid,
  p_mission_id uuid,
  p_scheduled_at timestamptz,
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
begin
  v_from_member_id := auth_member_id();
  if v_from_member_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_to_member_id = v_from_member_id then
    raise exception 'cannot_invite_self';
  end if;
  if p_scheduled_at < now() then
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

  begin
    perform create_notification(
      p_to_member_id,
      'activity_invited',
      v_from_name || ' ชวนคุณทำภารกิจ "' || v_mission.name || '" วันที่ ' ||
        to_char(p_scheduled_at, 'DD Mon YYYY HH24:MI'),
      '/invitations',
      jsonb_build_object('invitation_id', v_invitation_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true, 'invitation_id', v_invitation_id);
end;
$$;

grant execute on function create_invitation(uuid, uuid, timestamptz, text) to authenticated;

-- ============================================================
-- 2. respond_to_invitation() — invitee accepts/declines a pending invite
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
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now()
    where id = p_invitation_id;

  begin
    perform create_notification(
      v_inv.from_member_id,
      case when p_accept then 'activity_accepted' else 'activity_declined' end,
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

-- ============================================================
-- 3. counter_propose_invitation() — invitee proposes a different time
-- Default expiry: 3 days. After that, the inviter can no longer act
-- on it (enforced in respond_to_counter() below, not by a cron job —
-- checked lazily at the moment someone tries to respond).
-- ============================================================
create or replace function counter_propose_invitation(
  p_invitation_id uuid,
  p_new_scheduled_at timestamptz,
  p_message text default null,
  p_expires_in_days int default 3
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_inv activity_invitations%rowtype;
  v_mission missions%rowtype;
  v_to_name text;
  v_expires_at timestamptz;
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
  if p_new_scheduled_at < now() then
    raise exception 'scheduled_time_in_past';
  end if;
  if p_expires_in_days < 1 then
    raise exception 'invalid_expiry';
  end if;

  v_expires_at := now() + (p_expires_in_days || ' days')::interval;

  update activity_invitations
    set status = 'countered',
        counter_scheduled_at = p_new_scheduled_at,
        counter_message = p_message,
        counter_expires_at = v_expires_at
    where id = p_invitation_id;

  select * into v_mission from missions where id = v_inv.mission_id;
  select full_name into v_to_name from members where id = v_member_id;

  begin
    perform create_notification(
      v_inv.from_member_id,
      'activity_counter_proposed',
      v_to_name || ' ขอเสนอเวลาใหม่สำหรับภารกิจ "' || v_mission.name || '" เป็นวันที่ ' ||
        to_char(p_new_scheduled_at, 'DD Mon YYYY HH24:MI') ||
        ' (ตอบรับภายใน ' || p_expires_in_days || ' วัน)',
      '/invitations',
      jsonb_build_object('invitation_id', p_invitation_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function counter_propose_invitation(uuid, timestamptz, text, int) to authenticated;

-- ============================================================
-- 4. respond_to_counter() — inviter accepts/declines the countered time
-- ============================================================
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
    update activity_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'counter_expired';
  end if;

  update activity_invitations
    set status = case when p_accept then 'accepted' else 'declined' end,
        scheduled_at = case when p_accept then counter_scheduled_at else scheduled_at end,
        responded_at = now()
    where id = p_invitation_id;

  select * into v_mission from missions where id = v_inv.mission_id;
  select full_name into v_from_name from members where id = v_member_id;

  begin
    perform create_notification(
      v_inv.to_member_id,
      case when p_accept then 'activity_accepted' else 'activity_declined' end,
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

-- ============================================================
-- 5. get_my_invitations() — read helper with names attached.
-- Needed because a plain client-side embed of `members` for the
-- other party would be blocked by members' own strict RLS (same
-- reason list_colleagues() exists from Task 1) — this bypasses that
-- via SECURITY DEFINER but only ever returns invitations the caller
-- is actually part of.
-- ============================================================
create or replace function get_my_invitations()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', i.id,
      'mission_id', i.mission_id,
      'mission_name', m.name,
      'from_member_id', i.from_member_id,
      'from_name', fm.full_name,
      'to_member_id', i.to_member_id,
      'to_name', tm.full_name,
      'scheduled_at', i.scheduled_at,
      'message', i.message,
      'status', i.status,
      'counter_scheduled_at', i.counter_scheduled_at,
      'counter_message', i.counter_message,
      'counter_expires_at', i.counter_expires_at,
      'created_at', i.created_at,
      'is_sender', (i.from_member_id = auth_member_id())
    ) as row_data
    from activity_invitations i
    join missions m on m.id = i.mission_id
    join members fm on fm.id = i.from_member_id
    join members tm on tm.id = i.to_member_id
    where i.from_member_id = auth_member_id() or i.to_member_id = auth_member_id()
  ) sub;
$$;

grant execute on function get_my_invitations() to authenticated;
