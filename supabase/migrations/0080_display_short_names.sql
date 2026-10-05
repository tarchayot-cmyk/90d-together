-- Show participants' names without titles (นาย/นาง/นางสาว/ภก./ภญ. etc.)
-- everywhere a participant sees another participant: ranking, buddy/squad
-- progress, invitations, kindness history, colleague pickers, and
-- notification text. members.full_name is NOT changed -- admins still see
-- and search by the real full name, and nothing about login is affected.
--
-- Rule: strip a leading title, keep the first word (given name) and the
-- first word of what follows (surname). To switch to "given name + first
-- letter of surname" later, only short_name() needs to change.
--
-- Applied directly via Supabase MCP; this file records it in git.

create or replace function public.short_name(p_name text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(
    nullif(
      trim(split_part(s, ' ', 1) || coalesce(' ' || nullif(split_part(s, ' ', 2), ''), '')),
      ''
    ),
    p_name
  )
  from (
    select regexp_replace(
             regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'),
             '^(ภญ\.|ภก\.|นางสาว|นาง|นาย|ว่าที่ร้อยตรี|ดร\.)\s*',
             ''
           ) as s
  ) t
$$;

-- ---------------------------------------------------------------------
-- Ranking ('me' tab shows member names)
-- ---------------------------------------------------------------------
create or replace function public.get_leaderboard(p_type text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if p_type not in ('me', 'we', 'us') then
    raise exception 'invalid_type';
  end if;

  if p_type = 'me' then
    select coalesce(jsonb_agg(row_data order by (row_data->>'total_points')::numeric desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'id', m.id,
        'name', short_name(m.full_name),
        'employee_code', m.employee_code,
        'department', m.department,
        'avatar_url', m.avatar_url,
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from members m
      left join points_transactions pt on pt.member_id = m.id
      where m.role = 'participant' and m.is_active = true
      group by m.id, m.full_name, m.employee_code, m.department, m.avatar_url
    ) sub;

  elsif p_type = 'we' then
    select coalesce(jsonb_agg(row_data order by (row_data->>'total_points')::numeric desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'id', bg.id,
        'name', bg.name,
        'member_count', count(distinct bm.member_id),
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from buddy_groups bg
      left join buddy_members bm on bm.buddy_group_id = bg.id
      left join points_transactions pt on pt.member_id = bm.member_id
      group by bg.id, bg.name
    ) sub;

  else -- 'us'
    select coalesce(jsonb_agg(row_data order by (row_data->>'total_points')::numeric desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'member_count', count(distinct sm.member_id),
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from squads s
      left join squad_members sm on sm.squad_id = s.id
      left join points_transactions pt on pt.member_id = sm.member_id
      group by s.id, s.name
    ) sub;
  end if;

  return jsonb_build_object('type', p_type, 'rankings', v_result);
end;
$function$;

-- ---------------------------------------------------------------------
-- Colleague picker (Kindness / Invite). Column keeps the name full_name so
-- the client code does not change.
-- ---------------------------------------------------------------------
create or replace function public.list_colleagues()
returns table(id uuid, full_name text, department text, avatar_url text)
language sql
security definer
set search_path to 'public'
as $function$
  select m.id, short_name(m.full_name) as full_name, m.department, m.avatar_url
  from members m
  where m.is_active = true
    and m.role = 'participant'
    and m.auth_user_id <> auth.uid()
  order by short_name(m.full_name);
$function$;

-- ---------------------------------------------------------------------
-- Invitations list
-- ---------------------------------------------------------------------
create or replace function public.get_my_invitations()
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', i.id,
      'mission_id', i.mission_id,
      'mission_name', m.name,
      'from_member_id', i.from_member_id,
      'from_name', short_name(fm.full_name),
      'from_avatar_url', fm.avatar_url,
      'to_member_id', i.to_member_id,
      'to_name', short_name(tm.full_name),
      'to_avatar_url', tm.avatar_url,
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
$function$;

-- ---------------------------------------------------------------------
-- Kindness history (recipient name)
-- ---------------------------------------------------------------------
create or replace function public.get_my_sent_kindness()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member_id uuid;
  v_result jsonb;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into v_result
  from (
    select
      k.id,
      k.created_at,
      k.category,
      k.message,
      k.campaign_week,
      short_name(receiver.full_name) as to_name,
      exists (
        select 1 from points_transactions pt
        where pt.source = 'kindness' and pt.source_ref_id = k.id
      ) as awarded_points
    from kindness_logs k
    join members receiver on receiver.id = k.to_member_id
    where k.from_member_id = v_member_id
  ) row_data(id, created_at, category, message, campaign_week, to_name, awarded_points);

  return v_result;
end;
$function$;

-- ---------------------------------------------------------------------
-- Buddy / squad progress (member names inside the group)
-- ---------------------------------------------------------------------
create or replace function public.get_buddy_progress(p_target numeric default 80000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_campaign campaigns%rowtype;
  v_week int;
  v_total numeric := 0;
  v_members jsonb;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select bg.id, bg.name into v_group_id, v_group_name
  from buddy_members bm
  join buddy_groups bg on bg.id = bm.buddy_group_id
  where bm.member_id = v_member_id
  limit 1;

  if v_group_id is null then
    return jsonb_build_object('has_group', false);
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object(
      'has_group', true, 'group_name', v_group_name,
      'target', p_target, 'total', 0, 'remaining', p_target, 'members', '[]'::jsonb
    );
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select coalesce(sum(ci.value), 0) into v_total
  from check_ins ci
  join missions m on m.id = ci.mission_id
  join buddy_members bm on bm.member_id = ci.member_id and bm.buddy_group_id = v_group_id
  where m.category = 'buddy_walk' and ci.campaign_week = v_week;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', short_name(mem.full_name), 'avatar_url', mem.avatar_url, 'value', coalesce(row_val.value, 0))),
    '[]'::jsonb
  )
  into v_members
  from buddy_members bm
  join members mem on mem.id = bm.member_id
  left join lateral (
    select ci.value from check_ins ci
    join missions m on m.id = ci.mission_id
    where ci.member_id = bm.member_id and m.category = 'buddy_walk' and ci.campaign_week = v_week
    limit 1
  ) row_val on true
  where bm.buddy_group_id = v_group_id;

  return jsonb_build_object(
    'has_group', true,
    'group_name', v_group_name,
    'target', p_target,
    'total', v_total,
    'remaining', greatest(p_target - v_total, 0),
    'members', v_members
  );
end;
$function$;

create or replace function public.get_squad_progress(p_target numeric default 100000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_member_id uuid;
  v_squad_id uuid;
  v_squad_name text;
  v_campaign campaigns%rowtype;
  v_week int;
  v_total numeric := 0;
  v_members jsonb;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select s.id, s.name into v_squad_id, v_squad_name
  from squad_members sm
  join squads s on s.id = sm.squad_id
  where sm.member_id = v_member_id
  limit 1;

  if v_squad_id is null then
    return jsonb_build_object('has_group', false);
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object(
      'has_group', true, 'group_name', v_squad_name,
      'target', p_target, 'total', 0, 'remaining', p_target, 'members', '[]'::jsonb
    );
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select coalesce(sum(ci.value), 0) into v_total
  from check_ins ci
  join missions m on m.id = ci.mission_id
  join squad_members sm on sm.member_id = ci.member_id and sm.squad_id = v_squad_id
  where m.category = 'big_step' and ci.campaign_week = v_week;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', short_name(mem.full_name), 'avatar_url', mem.avatar_url, 'value', coalesce(row_val.value, 0))),
    '[]'::jsonb
  )
  into v_members
  from squad_members sm
  join members mem on mem.id = sm.member_id
  left join lateral (
    select ci.value from check_ins ci
    join missions m on m.id = ci.mission_id
    where ci.member_id = sm.member_id and m.category = 'big_step' and ci.campaign_week = v_week
    limit 1
  ) row_val on true
  where sm.squad_id = v_squad_id;

  return jsonb_build_object(
    'has_group', true,
    'group_name', v_squad_name,
    'target', p_target,
    'total', v_total,
    'remaining', greatest(p_target - v_total, 0),
    'members', v_members
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- Notification text that embeds the other person's name
-- ---------------------------------------------------------------------
create or replace function public.counter_propose_invitation(
  p_invitation_id uuid,
  p_new_scheduled_at timestamp with time zone,
  p_message text default null::text,
  p_expires_in_days integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  select short_name(full_name) into v_to_name from members where id = v_member_id;

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
$function$;

create or replace function public.create_invitation(
  p_to_member_id uuid,
  p_mission_id uuid,
  p_scheduled_at timestamp with time zone default null::timestamp with time zone,
  p_message text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  select short_name(full_name) into v_from_name from members where id = v_from_member_id;

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
$function$;

create or replace function public.respond_to_invitation(p_invitation_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  select short_name(full_name) into v_to_name from members where id = v_member_id;

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
$function$;

create or replace function public.respond_to_counter(p_invitation_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  select short_name(full_name) into v_from_name from members where id = v_member_id;

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
$function$;

-- ---------------------------------------------------------------------
-- Backfill: already-stored notifications that embed a full name with title
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select full_name, short_name(full_name) as sn
    from members
    where short_name(full_name) <> full_name
  loop
    update notifications
      set message = replace(message, r.full_name, r.sn)
      where position(r.full_name in message) > 0;
  end loop;
end $$;
