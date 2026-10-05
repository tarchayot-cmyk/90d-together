-- Weekly rotating, weighted Buddy pairing with admin preview -> confirm -> 7-day lock.
-- (0082 equivalent, "buddy_rounds_schema", added the enum value buddy_assigned,
--  table buddy_rounds and buddy_groups.round_id; applied via Supabase MCP.)

create or replace function public.buddy_prev_together(a uuid, b uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from buddy_members x
    join buddy_members y on y.buddy_group_id = x.buddy_group_id and y.member_id = b
    where x.member_id = a
  )
$$;

-- Random-but-weighted proposal. Nothing is saved. Admin can call it as often as wanted
-- until the current round is confirmed (then it is locked for 7 days).
create or replace function public.admin_preview_buddy_round()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campaign campaigns%rowtype;
  v_latest buddy_rounds%rowtype;
  v_ids uuid[];
  v_scores float8[];
  v_n int;
  v_try int;
  v_idx int[];
  v_groups uuid[][];
  v_best_groups jsonb;
  v_best_rep int := 1000000;
  v_rep int;
  v_j int;
  v_half int;
  v_cur jsonb;
  v_a uuid; v_b uuid; v_c uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then raise exception 'no_active_campaign'; end if;

  select * into v_latest from buddy_rounds where campaign_id = v_campaign.id order by round_no desc limit 1;
  if v_latest.id is not null and v_latest.locked_until > now() then
    raise exception 'round_locked';
  end if;

  -- engagement score = points in the last 14 days
  select array_agg(m.id order by s.score desc, m.id), array_agg(s.score::float8 order by s.score desc, m.id)
    into v_ids, v_scores
  from members m
  left join lateral (
    select coalesce(sum(pt.points), 0) as score from points_transactions pt
    where pt.member_id = m.id and pt.created_at >= now() - interval '14 days'
  ) s on true
  where m.is_active = true and m.role = 'participant';

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 2 then raise exception 'not_enough_members'; end if;
  v_half := v_n / 2;

  for v_try in 1..200 loop
    -- noisy ranking: strong & weak mix, but order changes every roll
    select array_agg(i order by k) into v_idx
    from (select i, (v_scores[i] + 1) * (0.6 + 0.8 * random()) + random() as k
          from generate_series(1, v_n) i) t;

    v_rep := 0;
    v_cur := '[]'::jsonb;
    for v_j in 1..v_half loop
      v_a := v_ids[v_idx[v_j]];
      v_b := v_ids[v_idx[v_n + 1 - v_j]];
      v_c := null;
      -- odd head-count: the middle-ranked person joins one pair as a trio
      if v_n % 2 = 1 and v_j = v_half then v_c := v_ids[v_idx[v_half + 1]]; end if;

      if buddy_prev_together(v_a, v_b) then v_rep := v_rep + 1; end if;
      if v_c is not null then
        if buddy_prev_together(v_a, v_c) then v_rep := v_rep + 1; end if;
        if buddy_prev_together(v_b, v_c) then v_rep := v_rep + 1; end if;
      end if;

      v_cur := v_cur || jsonb_build_array(
        to_jsonb(array_remove(array[v_a, v_b, v_c], null))
      );
    end loop;

    if v_rep < v_best_rep then
      v_best_rep := v_rep;
      v_best_groups := v_cur;
      exit when v_rep = 0 and v_try >= 20; -- good enough
    end if;
  end loop;

  return jsonb_build_object(
    'round_no', coalesce(v_latest.round_no, 0) + 1,
    'repeat_pairs', v_best_rep,
    'groups', (
      select jsonb_agg(jsonb_build_object(
        'name', 'Buddy ' || g.ord,
        'members', (
          select jsonb_agg(jsonb_build_object(
            'id', mm.id, 'full_name', mm.full_name,
            'score', coalesce((select sum(points) from points_transactions pt
                               where pt.member_id = mm.id and pt.created_at >= now() - interval '14 days'), 0))
            order by mm.full_name)
          from members mm
          where mm.id in (select (jsonb_array_elements_text(g.ids))::uuid)
        )
      ) order by g.ord)
      from (select ids, row_number() over () as ord
            from jsonb_array_elements(v_best_groups) as t(ids)) g
    )
  );
end;
$$;

-- Saves the previewed groups as the next round and locks re-rolling for 7 days.
create or replace function public.admin_confirm_buddy_round(p_groups jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campaign campaigns%rowtype;
  v_latest buddy_rounds%rowtype;
  v_admin uuid;
  v_round buddy_rounds%rowtype;
  v_group record;
  v_gid uuid;
  v_ids uuid[];
  v_all uuid[] := '{}';
  v_valid int;
  v_m uuid;
  v_names text;
  v_count int := 0;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin := auth_member_id();

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then raise exception 'no_active_campaign'; end if;

  perform pg_advisory_xact_lock(hashtext('buddy_round_' || v_campaign.id::text));

  select * into v_latest from buddy_rounds where campaign_id = v_campaign.id order by round_no desc limit 1;
  if v_latest.id is not null and v_latest.locked_until > now() then
    raise exception 'round_locked';
  end if;

  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'invalid_groups';
  end if;

  -- validate: every group >= 2, nobody twice, all active participants
  for v_group in select value as g from jsonb_array_elements(p_groups) loop
    select array_agg((e->>'id')::uuid) into v_ids from jsonb_array_elements(v_group.g->'members') e;
    if coalesce(array_length(v_ids, 1), 0) < 2 then raise exception 'group_too_small'; end if;
    v_all := v_all || v_ids;
  end loop;
  if (select count(distinct x) from unnest(v_all) x) <> array_length(v_all, 1) then
    raise exception 'duplicate_member';
  end if;
  select count(*) into v_valid from members where id = any(v_all) and is_active = true and role = 'participant';
  if v_valid <> array_length(v_all, 1) then raise exception 'invalid_member'; end if;

  insert into buddy_rounds (campaign_id, round_no, locked_until, confirmed_by)
  values (v_campaign.id, coalesce(v_latest.round_no, 0) + 1, now() + interval '7 days', v_admin)
  returning * into v_round;

  for v_group in select value as g, ordinality as ord from jsonb_array_elements(p_groups) with ordinality loop
    insert into buddy_groups (campaign_id, round_id, name)
    values (v_campaign.id, v_round.id, 'Buddy ' || v_group.ord) returning id into v_gid;

    select array_agg((e->>'id')::uuid) into v_ids from jsonb_array_elements(v_group.g->'members') e;
    foreach v_m in array v_ids loop
      insert into buddy_members (buddy_group_id, member_id) values (v_gid, v_m);
      select string_agg(short_name(mm.full_name), ', ' order by mm.full_name) into v_names
        from members mm where mm.id = any(v_ids) and mm.id <> v_m;
      perform create_notification(
        v_m, 'buddy_assigned',
        'Buddy รอบที่ ' || v_round.round_no || ' ของคุณคือ ' || v_names || ' 🤝 ชวนกันทำภารกิจ WE ได้เลย',
        '/home', jsonb_build_object('round_no', v_round.round_no)
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin, 'assign_buddy', 'campaign', v_campaign.id,
          jsonb_build_object('round_no', v_round.round_no, 'groups', jsonb_array_length(p_groups),
                             'members', v_count, 'locked_until', v_round.locked_until));

  return jsonb_build_object('success', true, 'round_no', v_round.round_no, 'locked_until', v_round.locked_until);
end;
$$;

-- Current round + groups (full names, admin only).
create or replace function public.admin_buddy_round_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campaign campaigns%rowtype;
  v_r buddy_rounds%rowtype;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  select * into v_r from buddy_rounds where campaign_id = v_campaign.id order by round_no desc limit 1;
  if v_r.id is null then
    return jsonb_build_object('has_round', false, 'locked', false, 'next_round_no', 1);
  end if;
  return jsonb_build_object(
    'has_round', true,
    'round_no', v_r.round_no,
    'started_at', v_r.started_at,
    'locked_until', v_r.locked_until,
    'locked', v_r.locked_until > now(),
    'next_round_no', v_r.round_no + 1,
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', bg.name,
        'members', (select jsonb_agg(jsonb_build_object('id', mm.id, 'full_name', mm.full_name) order by mm.full_name)
                    from buddy_members bm join members mm on mm.id = bm.member_id
                    where bm.buddy_group_id = bg.id)
      ) order by bg.name), '[]'::jsonb)
      from buddy_groups bg where bg.round_id = v_r.id
    )
  );
end;
$$;

-- Member view: only the group of the latest round.
create or replace function public.get_buddy_progress(p_target numeric default 80000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_round_no int;
  v_locked_until timestamptz;
  v_campaign campaigns%rowtype;
  v_week int;
  v_total numeric := 0;
  v_members jsonb;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then raise exception 'not_authenticated'; end if;

  select bg.id, bg.name, r.round_no, r.locked_until
    into v_group_id, v_group_name, v_round_no, v_locked_until
  from buddy_members bm
  join buddy_groups bg on bg.id = bm.buddy_group_id
  left join buddy_rounds r on r.id = bg.round_id
  where bm.member_id = v_member_id
  order by r.round_no desc nulls last
  limit 1;

  if v_group_id is null then
    return jsonb_build_object('has_group', false);
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object('has_group', true, 'group_name', v_group_name, 'round_no', v_round_no,
      'locked_until', v_locked_until, 'target', p_target, 'total', 0, 'remaining', p_target, 'members', '[]'::jsonb);
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select coalesce(sum(ci.value), 0) into v_total
  from check_ins ci
  join missions m on m.id = ci.mission_id
  join buddy_members bm on bm.member_id = ci.member_id and bm.buddy_group_id = v_group_id
  where m.category = 'buddy_walk' and ci.campaign_week = v_week;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', short_name(mem.full_name), 'avatar_url', mem.avatar_url, 'value', coalesce(row_val.value, 0))),
    '[]'::jsonb)
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
    'round_no', v_round_no,
    'locked_until', v_locked_until,
    'target', p_target,
    'total', v_total,
    'remaining', greatest(p_target - v_total, 0),
    'members', v_members
  );
end;
$$;

create or replace function public.get_admin_reminders()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campaign campaigns%rowtype;
  v_current_day int;
  v_latest_lock timestamptz;
  v_has_squads boolean := false;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object('needs_buddy_assignment', false, 'needs_squad_assignment', false);
  end if;

  v_current_day := (current_date - v_campaign.start_date + 1)::int;
  select locked_until into v_latest_lock from buddy_rounds
    where campaign_id = v_campaign.id order by round_no desc limit 1;
  select exists (select 1 from squads where campaign_id = v_campaign.id) into v_has_squads;

  return jsonb_build_object(
    -- due when the WE phase is on and there is no round yet, or the last one's week is over
    'needs_buddy_assignment', (v_current_day >= 31 and v_current_day < 61 and (v_latest_lock is null or v_latest_lock <= now())),
    'needs_squad_assignment', (v_current_day >= 61 and not v_has_squads)
  );
end;
$$;

