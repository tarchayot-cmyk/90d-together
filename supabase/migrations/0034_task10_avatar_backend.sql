-- ============================================================
-- TASK 10 (backend) — Avatar / Member UX
-- Every RPC below is otherwise byte-identical to its live version —
-- the only change is adding avatar_url to the returned shape, so
-- the frontend can render a picture instead of just an initial.
-- ============================================================

-- ------------------------------------------------------------
-- 1. list_colleagues() — return type changes (new output column),
-- so the function must be dropped before it can be recreated.
-- ------------------------------------------------------------
drop function if exists list_colleagues();

create or replace function list_colleagues()
returns table (id uuid, full_name text, department text, avatar_url text)
language sql
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.department, m.avatar_url
  from members m
  where m.is_active = true
    and m.role = 'participant'
    and m.auth_user_id <> auth.uid()
  order by m.full_name;
$$;

grant execute on function list_colleagues() to authenticated;

-- ------------------------------------------------------------
-- 2. get_my_invitations() — adds from_avatar_url / to_avatar_url.
-- Still returns jsonb, so no drop needed.
-- ------------------------------------------------------------
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
      'from_avatar_url', fm.avatar_url,
      'to_member_id', i.to_member_id,
      'to_name', tm.full_name,
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
$$;

grant execute on function get_my_invitations() to authenticated;

-- ------------------------------------------------------------
-- 3. get_leaderboard() — avatar only makes sense for the 'me'
-- (individual) tab; 'we'/'us' rank groups, not people.
-- ------------------------------------------------------------
create or replace function get_leaderboard(p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
        'name', m.full_name,
        'department', m.department,
        'avatar_url', m.avatar_url,
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from members m
      left join points_transactions pt on pt.member_id = m.id
      where m.role = 'participant' and m.is_active = true
      group by m.id, m.full_name, m.department, m.avatar_url
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
$$;

grant execute on function get_leaderboard(text) to authenticated;

-- ------------------------------------------------------------
-- 4. get_buddy_progress() / get_squad_progress() — adds
-- avatar_url per member in the roster breakdown.
-- ------------------------------------------------------------
create or replace function get_buddy_progress(p_target numeric default 80000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    jsonb_agg(jsonb_build_object('name', mem.full_name, 'avatar_url', mem.avatar_url, 'value', coalesce(row_val.value, 0))),
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
$$;

create or replace function get_squad_progress(p_target numeric default 100000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    jsonb_agg(jsonb_build_object('name', mem.full_name, 'avatar_url', mem.avatar_url, 'value', coalesce(row_val.value, 0))),
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
$$;

grant execute on function get_buddy_progress(numeric) to authenticated;
grant execute on function get_squad_progress(numeric) to authenticated;

-- ------------------------------------------------------------
-- 5. get_proposals_with_votes() — proposed_by_avatar_url follows
-- the EXACT same admin-only conditional as proposed_by_name
-- already does (Task 3 refinement) — members still can't see who
-- proposed an activity, avatar included.
-- ------------------------------------------------------------
create or replace function get_proposals_with_votes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
begin
  v_admin := is_admin();

  return (
    select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'description', p.description,
        'status', p.status,
        'proposed_by_name', case when v_admin then p.proposed_by_name else null end,
        'proposed_by_avatar_url', case when v_admin then pm.avatar_url else null end,
        'created_at', p.created_at,
        'voting_opened_at', p.voting_opened_at,
        'voting_closed_at', p.voting_closed_at,
        'yes_count', (select count(*) from activity_votes v where v.proposal_id = p.id and v.choice = 'yes'),
        'no_count', (select count(*) from activity_votes v where v.proposal_id = p.id and v.choice = 'no'),
        'my_choice', (
          select v.choice from activity_votes v
          where v.proposal_id = p.id and v.member_id = auth_member_id()
        )
      ) as row_data
      from activity_proposals p
      left join members pm on pm.id = p.proposed_by
      where v_admin or p.status <> 'rejected'
    ) sub
  );
end;
$$;

grant execute on function get_proposals_with_votes() to authenticated;
