-- Applied via Supabase MCP (comeback_bonus_weekly_goals).
-- Requires 0092 (notification_type += comeback_bonus, weekly_goal_completed).
--
-- (1) Comeback bonus: +30 when a check-in passes after 3+ consecutive Thai days with no
--     passing check-in (counting from campaign start for first-timers); max once per 7 days.
-- (2) Weekly goal 2/4/6 days per campaign week (Thai dates). Reaching it gives +30 once per
--     week, automatically. Bonus points use their own sources so theme caps ignore them.
--     The goal can be set any time, but changing it is locked after the Wednesday of the
--     campaign week or once completed (error goal_locked).
-- (3) 9 badges, theme 'goal': goal.weeks_N = completed weeks whose target was >= N days.

alter table points_transactions drop constraint points_transactions_source_check;
alter table points_transactions add constraint points_transactions_source_check
  check (source = any (array['mission', 'kindness', 'admin_adjust', 'comeback', 'weekly_goal']));

alter table badges drop constraint badges_theme_check;
alter table badges add constraint badges_theme_check
  check (theme = any (array['move', 'fuel', 'rest', 'mind', 'connect', 'goal']));

create table if not exists weekly_goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  week int not null check (week >= 1),
  target_days int not null check (target_days in (2, 4, 6)),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, campaign_id, week)
);
alter table weekly_goals enable row level security;
create policy weekly_goals_select_own_or_admin on weekly_goals
  for select using (member_id = auth_member_id() or is_admin());

-- Distinct Thai dates with a passing check-in inside campaign week p_week.
create or replace function weekly_goal_days_done(p_member_id uuid, p_campaign_id uuid, p_week int)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct (ci.created_at at time zone 'Asia/Bangkok')::date)::int
  from check_ins ci
  join missions m on m.id = ci.mission_id
  join campaigns c on c.id = p_campaign_id
  where ci.member_id = p_member_id
    and m.campaign_id = p_campaign_id
    and ci.completed_at is not null
    and (ci.created_at at time zone 'Asia/Bangkok')::date
        between c.start_date + (p_week - 1) * 7 and c.start_date + (p_week - 1) * 7 + 6
$$;

-- Awards the weekly goal bonus if the target is met and not yet awarded. Idempotent.
create or replace function try_award_weekly_goal(p_member_id uuid, p_campaign_id uuid, p_week int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_goal weekly_goals%rowtype;
begin
  select * into v_goal from weekly_goals
    where member_id = p_member_id and campaign_id = p_campaign_id and week = p_week
    for update;
  if v_goal.id is null or v_goal.completed_at is not null then
    return false;
  end if;
  if weekly_goal_days_done(p_member_id, p_campaign_id, p_week) < v_goal.target_days then
    return false;
  end if;

  update weekly_goals set completed_at = now(), updated_at = now() where id = v_goal.id;
  insert into points_transactions (member_id, points, source, source_ref_id)
    values (p_member_id, 30, 'weekly_goal', v_goal.id);

  perform check_achievements(p_member_id);

  begin
    perform create_notification(
      p_member_id, 'weekly_goal_completed',
      '🎯 ถึงเป้าสัปดาห์นี้แล้ว! เช็คอินครบ ' || v_goal.target_days || ' วัน ได้รับโบนัส +30 แต้ม 🎉',
      '/home',
      jsonb_build_object('weekly_goal_id', v_goal.id, 'week', p_week, 'target_days', v_goal.target_days)
    );
  exception when others then null;
  end;
  return true;
end;
$$;

-- Comeback bonus for a passing check-in. Idempotent per check-in.
create or replace function try_award_comeback(p_checkin_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_ci check_ins%rowtype;
  v_campaign campaigns%rowtype;
  v_day date;
  v_last date;
begin
  select * into v_ci from check_ins where id = p_checkin_id;
  if v_ci.id is null or v_ci.completed_at is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('comeback:' || v_ci.member_id::text));

  select c.* into v_campaign from campaigns c join missions m on m.campaign_id = c.id where m.id = v_ci.mission_id;
  v_day := (v_ci.created_at at time zone 'Asia/Bangkok')::date;

  -- only the first passing check-in of that Thai day can be a comeback
  if exists (
    select 1 from check_ins o
    where o.member_id = v_ci.member_id and o.id <> v_ci.id and o.completed_at is not null
      and (o.created_at at time zone 'Asia/Bangkok')::date = v_day
  ) then
    return false;
  end if;

  select max((o.created_at at time zone 'Asia/Bangkok')::date) into v_last
    from check_ins o
    where o.member_id = v_ci.member_id and o.id <> v_ci.id and o.completed_at is not null
      and (o.created_at at time zone 'Asia/Bangkok')::date < v_day;
  v_last := coalesce(v_last, v_campaign.start_date - 1);

  if v_day - v_last - 1 < 3 then
    return false;
  end if;

  if exists (
    select 1 from points_transactions pt
    where pt.member_id = v_ci.member_id and pt.source = 'comeback'
      and (pt.source_ref_id = v_ci.id or pt.created_at > now() - interval '7 days')
  ) then
    return false;
  end if;

  insert into points_transactions (member_id, points, source, source_ref_id)
    values (v_ci.member_id, 30, 'comeback', v_ci.id);

  begin
    perform create_notification(
      v_ci.member_id, 'comeback_bonus',
      '👋 ยินดีต้อนรับกลับมา! ดีใจที่ได้เห็นคุณอีกครั้ง รับโบนัสกลับมา +30 แต้ม 🎉',
      '/home',
      jsonb_build_object('check_in_id', v_ci.id, 'days_away', v_day - v_last - 1)
    );
  exception when others then null;
  end;
  return true;
end;
$$;

-- Called after a check-in passes (no-proof submit or admin approval).
-- Never lets a bonus error break the check-in itself.
create or replace function after_checkin_completed(p_checkin_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ci check_ins%rowtype;
  v_campaign campaigns%rowtype;
  v_week int;
  v_comeback boolean := false;
  v_goal boolean := false;
begin
  select * into v_ci from check_ins where id = p_checkin_id;
  if v_ci.id is null then
    return null;
  end if;
  select c.* into v_campaign from campaigns c join missions m on m.campaign_id = c.id where m.id = v_ci.mission_id;
  v_week := ((v_ci.created_at at time zone 'Asia/Bangkok')::date - v_campaign.start_date) / 7 + 1;

  begin
    v_comeback := try_award_comeback(p_checkin_id);
  exception when others then
    raise warning 'comeback bonus failed for %: %', p_checkin_id, sqlerrm;
  end;

  if v_week >= 1 then
    begin
      v_goal := try_award_weekly_goal(v_ci.member_id, v_campaign.id, v_week);
    exception when others then
      raise warning 'weekly goal award failed for %: %', p_checkin_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'comeback_points', case when v_comeback then 30 else 0 end,
    'weekly_goal_points', case when v_goal then 30 else 0 end
  );
end;
$$;

create or replace function get_weekly_goal_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_campaign campaigns%rowtype;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_day int;
  v_week int;
  v_week_start date;
  v_lock_date date;
  v_goal weekly_goals%rowtype;
  v_prev_days int;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object('active', false);
  end if;
  v_day := v_today - v_campaign.start_date + 1;
  if v_day < 1 or v_day > 90 then
    return jsonb_build_object('active', false);
  end if;

  v_week := (v_day - 1) / 7 + 1;
  v_week_start := v_campaign.start_date + (v_week - 1) * 7;
  v_lock_date := v_week_start + ((3 - extract(dow from v_week_start)::int + 7) % 7); -- Wednesday of this week

  select * into v_goal from weekly_goals
    where member_id = v_member_id and campaign_id = v_campaign.id and week = v_week;

  v_prev_days := case when v_week > 1 then weekly_goal_days_done(v_member_id, v_campaign.id, v_week - 1) end;

  return jsonb_build_object(
    'active', true,
    'week', v_week,
    'target_days', v_goal.target_days,
    'days_done', weekly_goal_days_done(v_member_id, v_campaign.id, v_week),
    'completed', v_goal.completed_at is not null,
    'can_change', v_goal.id is null or (v_goal.completed_at is null and v_today <= v_lock_date),
    'suggested_days', case when v_prev_days >= 6 then 6 when v_prev_days >= 4 then 4 else 2 end,
    'bonus_points', 30,
    'completed_weeks', (select count(*) from weekly_goals
      where member_id = v_member_id and campaign_id = v_campaign.id and completed_at is not null)
  );
end;
$$;

create or replace function set_weekly_goal(p_target_days int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_campaign campaigns%rowtype;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_day int;
  v_week int;
  v_week_start date;
  v_lock_date date;
  v_goal weekly_goals%rowtype;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_target_days is null or p_target_days not in (2, 4, 6) then
    raise exception 'invalid_target_days';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  v_day := v_today - v_campaign.start_date + 1;
  if v_campaign.id is null or v_day < 1 or v_day > 90 then
    raise exception 'campaign_not_active';
  end if;

  v_week := (v_day - 1) / 7 + 1;
  v_week_start := v_campaign.start_date + (v_week - 1) * 7;
  v_lock_date := v_week_start + ((3 - extract(dow from v_week_start)::int + 7) % 7);

  select * into v_goal from weekly_goals
    where member_id = v_member_id and campaign_id = v_campaign.id and week = v_week
    for update;

  if v_goal.id is null then
    insert into weekly_goals (member_id, campaign_id, week, target_days)
      values (v_member_id, v_campaign.id, v_week, p_target_days)
      on conflict (member_id, campaign_id, week) do nothing;
  elsif v_goal.target_days <> p_target_days then
    if v_goal.completed_at is not null or v_today > v_lock_date then
      raise exception 'goal_locked';
    end if;
    update weekly_goals set target_days = p_target_days, updated_at = now() where id = v_goal.id;
  end if;

  perform try_award_weekly_goal(v_member_id, v_campaign.id, v_week);
  return get_weekly_goal_status();
end;
$$;

revoke execute on function weekly_goal_days_done(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function try_award_weekly_goal(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function try_award_comeback(uuid) from public, anon, authenticated;
revoke execute on function after_checkin_completed(uuid) from public, anon, authenticated;
revoke execute on function get_weekly_goal_status() from public, anon;
revoke execute on function set_weekly_goal(int) from public, anon;
grant execute on function get_weekly_goal_status() to authenticated;
grant execute on function set_weekly_goal(int) to authenticated;

-- Hook the bonuses into the two places a check-in becomes "passed", and keep the rest of
-- the live definitions untouched (patched in place; aborts if an anchor no longer matches).
do $do$
declare
  v_def text;
  v_new text;
begin
  -- complete_mission
  v_def := pg_get_functiondef('public.complete_mission(uuid, numeric, text, text[])'::regprocedure);
  v_new := replace(v_def, E'  v_capped boolean := false;\nbegin', E'  v_capped boolean := false;\n  v_bonus jsonb;\nbegin');
  v_new := replace(v_new, E'  perform check_achievements(v_member_id);\n\n  return jsonb_build_object(\n    ''success'', true,\n    ''pending_review'', false,',
    E'  perform check_achievements(v_member_id);\n  v_bonus := after_checkin_completed(v_checkin_id);\n\n  return jsonb_build_object(\n    ''success'', true,\n    ''pending_review'', false,\n    ''bonus'', v_bonus,');
  if v_new = v_def or position('after_checkin_completed' in v_new) = 0 or position('v_bonus jsonb' in v_new) = 0 then
    raise exception 'complete_mission anchor not found';
  end if;
  execute v_new;

  -- admin_approve_checkin
  v_def := pg_get_functiondef('public.admin_approve_checkin(uuid, boolean, text)'::regprocedure);
  v_new := replace(v_def, E'    perform check_achievements(v_checkin.member_id);\n',
    E'    perform check_achievements(v_checkin.member_id);\n    perform after_checkin_completed(p_checkin_id);\n');
  if v_new = v_def then
    raise exception 'admin_approve_checkin anchor not found';
  end if;
  execute v_new;

  -- admin_delete_checkin: also remove a comeback bonus that came from this check-in
  v_def := pg_get_functiondef('public.admin_delete_checkin(uuid)'::regprocedure);
  v_new := replace(v_def, 'delete from stickers where source = ''mission'' and source_ref_id = v_checkin.id;',
    'delete from stickers where source = ''mission'' and source_ref_id = v_checkin.id;' || E'\r\n' ||
    '  delete from points_transactions where source = ''comeback'' and source_ref_id = v_checkin.id;');
  if v_new = v_def then
    raise exception 'admin_delete_checkin anchor not found';
  end if;
  execute v_new;

  -- admin_reset_results: clear weekly goals too
  v_def := pg_get_functiondef('public.admin_reset_results()'::regprocedure);
  v_new := replace(v_def, 'delete from points_transactions where true;',
    'delete from points_transactions where true;' || E'\r\n' || '  delete from weekly_goals where true;');
  if v_new = v_def then
    raise exception 'admin_reset_results anchor not found';
  end if;
  execute v_new;

  -- get_member_score_details: label the new point sources
  v_def := pg_get_functiondef('public.get_member_score_details(uuid)'::regprocedure);
  v_new := replace(v_def, 'case when pt.source = ''kindness'' then ''Kindness'' end,',
    'case pt.source when ''kindness'' then ''Kindness'' when ''comeback'' then ''โบนัสกลับมา 👋'' when ''weekly_goal'' then ''เป้ารายสัปดาห์สำเร็จ 🎯'' end,');
  if v_new = v_def then
    raise exception 'get_member_score_details anchor not found';
  end if;
  execute v_new;

  -- get_badge_measurements: add goal.weeks_2/4/6
  v_def := pg_get_functiondef('public.get_badge_measurements(uuid)'::regprocedure);
  v_new := replace(v_def, E'    ''kindness_received'', v_kindness_received,\n',
    E'    ''kindness_received'', v_kindness_received,\n' ||
    E'    ''goal'', (select jsonb_build_object(''weeks_2'', count(*) filter (where wg.target_days >= 2), ''weeks_4'', count(*) filter (where wg.target_days >= 4), ''weeks_6'', count(*) filter (where wg.target_days >= 6)) from weekly_goals wg where wg.member_id = p_member_id and wg.campaign_id = v_campaign.id and wg.completed_at is not null),\n');
  if v_new = v_def then
    raise exception 'get_badge_measurements anchor not found';
  end if;
  execute v_new;

  -- admin_upsert_badge: allow theme 'goal' with its own fields
  v_def := pg_get_functiondef('public.admin_upsert_badge(uuid, text, text, text, text, text, text, text, numeric, text)'::regprocedure);
  v_new := replace(v_def, 'if p_theme not in (''move'', ''fuel'', ''rest'', ''mind'', ''connect'') then',
    'if p_theme not in (''move'', ''fuel'', ''rest'', ''mind'', ''connect'', ''goal'') then');
  v_new := replace(v_new, 'v_field_suffix := split_part(p_condition_field, ''.'', 2);',
    'v_field_suffix := split_part(p_condition_field, ''.'', 2);' || E'\r\n' ||
    '  if p_theme = ''goal'' then v_valid_fields := array[''weeks_2'', ''weeks_4'', ''weeks_6'']; end if;');
  if position('''goal''' in v_new) = 0 or position('weeks_2' in v_new) = 0 then
    raise exception 'admin_upsert_badge anchor not found';
  end if;
  execute v_new;
end
$do$;

insert into badges (code, family_code, tier, theme, name, description, icon, condition_field, target_value) values
  ('goal_2days_bulk',  'goal_2days', 'bulk',  'goal', 'ก้าวแรกที่สม่ำเสมอ 🥉', 'ทำเป้ารายสัปดาห์ 2 วัน (หรือมากกว่า) สำเร็จครบ 2 สัปดาห์', '🌱', 'goal.weeks_2', 2),
  ('goal_2days_lean',  'goal_2days', 'lean',  'goal', 'ก้าวแรกที่สม่ำเสมอ 🥈', 'ทำเป้ารายสัปดาห์ 2 วัน (หรือมากกว่า) สำเร็จครบ 4 สัปดาห์', '🌱', 'goal.weeks_2', 4),
  ('goal_2days_smart', 'goal_2days', 'smart', 'goal', 'ก้าวแรกที่สม่ำเสมอ 🥇', 'ทำเป้ารายสัปดาห์ 2 วัน (หรือมากกว่า) สำเร็จครบ 8 สัปดาห์', '🌱', 'goal.weeks_2', 8),
  ('goal_4days_bulk',  'goal_4days', 'bulk',  'goal', 'จังหวะประจำสัปดาห์ 🥉', 'ทำเป้ารายสัปดาห์ 4 วัน (หรือมากกว่า) สำเร็จครบ 2 สัปดาห์', '🌿', 'goal.weeks_4', 2),
  ('goal_4days_lean',  'goal_4days', 'lean',  'goal', 'จังหวะประจำสัปดาห์ 🥈', 'ทำเป้ารายสัปดาห์ 4 วัน (หรือมากกว่า) สำเร็จครบ 4 สัปดาห์', '🌿', 'goal.weeks_4', 4),
  ('goal_4days_smart', 'goal_4days', 'smart', 'goal', 'จังหวะประจำสัปดาห์ 🥇', 'ทำเป้ารายสัปดาห์ 4 วัน (หรือมากกว่า) สำเร็จครบ 8 สัปดาห์', '🌿', 'goal.weeks_4', 8),
  ('goal_6days_bulk',  'goal_6days', 'bulk',  'goal', 'ตัวจริงแห่งความสม่ำเสมอ 🥉', 'ทำเป้ารายสัปดาห์ 6 วัน สำเร็จครบ 1 สัปดาห์', '🌳', 'goal.weeks_6', 1),
  ('goal_6days_lean',  'goal_6days', 'lean',  'goal', 'ตัวจริงแห่งความสม่ำเสมอ 🥈', 'ทำเป้ารายสัปดาห์ 6 วัน สำเร็จครบ 3 สัปดาห์', '🌳', 'goal.weeks_6', 3),
  ('goal_6days_smart', 'goal_6days', 'smart', 'goal', 'ตัวจริงแห่งความสม่ำเสมอ 🥇', 'ทำเป้ารายสัปดาห์ 6 วัน สำเร็จครบ 6 สัปดาห์', '🌳', 'goal.weeks_6', 6)
on conflict (code) do nothing;
