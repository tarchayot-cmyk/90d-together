-- ============================================================
-- 90 Days Growing Together — Sprint 4 Migration
-- Badge / Achievement Engine + Leaderboard + Tree Engine
-- Depends on Sprints 1-3 (members, missions, check_ins, campaigns,
-- points_transactions, stickers, kindness_logs, buddy_groups,
-- buddy_members, squads, squad_members, auth_member_id(), is_admin()
-- all already exist).
-- Run once, top to bottom, in the Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 0. TABLES — badges / member_badges
-- ------------------------------------------------------------
create table badges (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

create table member_badges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  badge_id uuid not null references badges (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (member_id, badge_id)
);

create index idx_member_badges_member on member_badges (member_id);

alter table badges enable row level security;
alter table member_badges enable row level security;

create policy badges_select on badges for select using (auth.uid() is not null);
create policy badges_admin_write on badges for all using (is_admin()) with check (is_admin());

-- Read own (or admin); no client writes at all — only
-- check_achievements() (SECURITY DEFINER) ever inserts here.
create policy member_badges_select on member_badges
  for select using (member_id = auth_member_id() or is_admin());
revoke insert, update, delete on member_badges from authenticated;

-- Seed the 6 V1 badges (spec section 21)
insert into badges (code, name, description, icon) values
  ('7_day_warrior', '7-Day Warrior', 'Streak การทำภารกิจสำเร็จต่อเนื่อง 7 สัปดาห์', '🏅'),
  ('consistency_master', 'Consistency Master', 'ทำภารกิจสำเร็จ 4 อย่างขึ้นไปในสัปดาห์เดียว', '🏅'),
  ('buddy_hero', 'Buddy Hero', 'ทำภารกิจระดับ Buddy (WE) สำเร็จ 3 ครั้งขึ้นไป', '🤝'),
  ('squad_champion', 'Squad Champion', 'ทำภารกิจระดับ Squad (US) สำเร็จ', '🌳'),
  ('kindness_star', 'Kindness Star', 'ได้รับ Kindness 5 ครั้งขึ้นไป', '🌈'),
  ('90_day_finisher', '90-Day Finisher', 'ทำแคมเปญครบ 90 วัน', '🏆')
on conflict (code) do nothing;

-- ============================================================
-- 1. check_achievements(p_member_id uuid)
-- Internal-only (see grants at bottom): evaluates all 6 badge
-- conditions and writes any newly-earned ones to member_badges.
-- Returns a jsonb array of the badge codes unlocked *this call*.
-- ============================================================
create or replace function check_achievements(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_streak int := 0;
  v_weekly_missions int := 0;
  v_buddy_missions int := 0;
  v_squad_success boolean := false;
  v_kindness_received int := 0;
  v_campaign_finished boolean := false;
  v_current_week int;
  v_code text;
  v_newly_unlocked jsonb := '[]'::jsonb;
  v_already boolean;
  v_badge_id uuid;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return v_newly_unlocked;
  end if;

  v_current_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  -- 7-Day Warrior: distinct weeks with a completed check-in >= 7
  -- (V1 approximation — missions here are weekly, so a true daily
  -- streak needs a separate daily-activity log; this reads "7
  -- different weeks of showing up" as the closest proxy).
  select count(distinct campaign_week) into v_streak
    from check_ins where member_id = p_member_id and completed_at is not null;

  -- Consistency Master: >=4 completed missions in the current week
  select count(*) into v_weekly_missions
    from check_ins
    where member_id = p_member_id and completed_at is not null and campaign_week = v_current_week;

  -- Buddy Hero: >=3 completed WE-level missions (lifetime this campaign)
  select count(*) into v_buddy_missions
    from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we';

  -- Squad Champion: any completed US-level mission
  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us'
  ) into v_squad_success;

  -- Kindness Star: received >=5 kindness this campaign
  select count(*) into v_kindness_received
    from kindness_logs where to_member_id = p_member_id and campaign_id = v_campaign.id;

  -- 90-Day Finisher: campaign has ended
  v_campaign_finished := current_date > v_campaign.end_date;

  for v_code in
    select unnest(array[
      case when v_streak >= 7 then '7_day_warrior' end,
      case when v_weekly_missions >= 4 then 'consistency_master' end,
      case when v_buddy_missions >= 3 then 'buddy_hero' end,
      case when v_squad_success then 'squad_champion' end,
      case when v_kindness_received >= 5 then 'kindness_star' end,
      case when v_campaign_finished then '90_day_finisher' end
    ])
  loop
    continue when v_code is null;

    select id into v_badge_id from badges where code = v_code;
    continue when v_badge_id is null;

    select exists (
      select 1 from member_badges where member_id = p_member_id and badge_id = v_badge_id
    ) into v_already;

    if not v_already then
      insert into member_badges (member_id, badge_id) values (p_member_id, v_badge_id)
        on conflict do nothing;
      v_newly_unlocked := v_newly_unlocked || jsonb_build_object('code', v_code);
    end if;
  end loop;

  return v_newly_unlocked;
end;
$$;

-- Deliberately NOT granted to `authenticated` — this function is meant
-- to run automatically from inside complete_mission() / give_kindness()
-- (see step 4 below), which execute as the (superuser-owned) function
-- definer and can call it regardless of grants. Keeping it un-grantable
-- to the client means nobody can trigger badge checks for someone
-- else's member_id directly from the browser.

-- ============================================================
-- 2. get_leaderboard(p_type text)  — spec sections 18-19
-- p_type: 'me' | 'we' | 'us'. Ranked by Growth Points only —
-- never by health metrics like weight, per spec section 19.
-- ============================================================
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
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from members m
      left join points_transactions pt on pt.member_id = m.id
      where m.role = 'participant' and m.is_active = true
      group by m.id, m.full_name, m.department
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

-- ============================================================
-- 3. get_tree_progress()  — spec section 22
-- Returns { level, progress, me, we, us } for the CALLING member.
-- V1 approximation: each phase is a fixed 30-day / ~5-week window
-- (day 1-30 ME, 31-60 WE, 61-90 US, per spec section 1's table).
-- Progress per level = (distinct weeks with >=1 completed check-in
-- at that level) / (weeks in that phase), capped at 100%.
-- ============================================================
create or replace function get_tree_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_campaign campaigns%rowtype;
  v_day int;
  v_level int;
  v_weeks_per_phase constant numeric := 5; -- ceil(30/7)
  v_me numeric := 0;
  v_we numeric := 0;
  v_us numeric := 0;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object('level', 1, 'progress', 0, 'me', 0, 'we', 0, 'us', 0);
  end if;

  v_day := greatest(1, current_date - v_campaign.start_date + 1);
  v_level := case when v_day <= 30 then 1 when v_day <= 60 then 2 else 3 end;

  select least(1.0, count(distinct ci.campaign_week) / v_weeks_per_phase) into v_me
    from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = v_member_id and m.level = 'me' and ci.completed_at is not null;

  select least(1.0, count(distinct ci.campaign_week) / v_weeks_per_phase) into v_we
    from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = v_member_id and m.level = 'we' and ci.completed_at is not null;

  select least(1.0, count(distinct ci.campaign_week) / v_weeks_per_phase) into v_us
    from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = v_member_id and m.level = 'us' and ci.completed_at is not null;

  return jsonb_build_object(
    'level', v_level,
    'progress', round(((coalesce(v_me, 0) + coalesce(v_we, 0) + coalesce(v_us, 0)) / 3)::numeric, 2),
    'me', round(coalesce(v_me, 0)::numeric, 2),
    'we', round(coalesce(v_we, 0)::numeric, 2),
    'us', round(coalesce(v_us, 0)::numeric, 2)
  );
end;
$$;

grant execute on function get_tree_progress() to authenticated;

-- ============================================================
-- 4. Wire check_achievements() into the reward paths so badge
-- unlocks happen automatically, with no extra client call needed.
-- Re-declares complete_mission() / give_kindness() from Sprints
-- 2-3 with one added line each (`perform check_achievements(...)`)
-- right after their existing reward inserts — everything else is
-- unchanged from before.
-- ============================================================
create or replace function complete_mission(
  p_mission_id uuid,
  p_value numeric,
  p_note text default null,
  p_proof_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_mission missions%rowtype;
  v_campaign campaigns%rowtype;
  v_campaign_week int;
  v_already_checked_in boolean;
  v_checkin_id uuid;
  v_sticker jsonb := null;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_mission from missions where id = p_mission_id and is_active = true;
  if v_mission.id is null then
    raise exception 'mission_not_found';
  end if;

  select * into v_campaign from campaigns where id = v_mission.campaign_id and is_active = true;
  if v_campaign.id is null then
    raise exception 'campaign_not_active';
  end if;

  v_campaign_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select exists (
    select 1 from check_ins
    where mission_id = p_mission_id and member_id = v_member_id and campaign_week = v_campaign_week
  ) into v_already_checked_in;

  if v_already_checked_in then
    raise exception 'already_checked_in_this_week'
      using detail = format('mission_id=%s, week=%s', p_mission_id, v_campaign_week);
  end if;

  if p_value is null or p_value < v_mission.target_value then
    raise exception 'target_not_reached'
      using detail = format(
        'need %s %s, submitted %s', v_mission.target_value, v_mission.unit, coalesce(p_value, 0)
      );
  end if;

  insert into check_ins (
    mission_id, member_id, campaign_week, value, note, proof_url, proof_status, completed_at
  ) values (
    p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_url,
    case when v_mission.requires_proof then 'pending' else 'not_required' end,
    now()
  )
  returning id into v_checkin_id;

  insert into points_transactions (member_id, points, source, source_ref_id)
  values (v_member_id, v_mission.points, 'mission', v_checkin_id);

  if v_mission.sticker_color is not null and v_mission.sticker_amount > 0 then
    insert into stickers (member_id, color, amount, source, source_ref_id)
    values (v_member_id, v_mission.sticker_color, v_mission.sticker_amount, 'mission', v_checkin_id);

    v_sticker := jsonb_build_object('color', v_mission.sticker_color, 'amount', v_mission.sticker_amount);
  end if;

  -- NEW in Sprint 4: automatic badge check right after the reward.
  perform check_achievements(v_member_id);

  return jsonb_build_object(
    'success', true,
    'points', v_mission.points,
    'sticker', v_sticker,
    'message', 'Mission Complete!'
  );
end;
$$;

grant execute on function complete_mission(uuid, numeric, text, text) to authenticated;

create or replace function give_kindness(
  p_to_member_id uuid,
  p_category kindness_category,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_member_id uuid;
  v_campaign campaigns%rowtype;
  v_week int;
  v_pair_count int;
  v_recipient_count int;
  v_kindness_id uuid;
begin
  v_from_member_id := auth_member_id();
  if v_from_member_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_to_member_id = v_from_member_id then
    raise exception 'cannot_send_to_self';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    raise exception 'campaign_not_active';
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select count(*) into v_pair_count from kindness_logs
    where from_member_id = v_from_member_id and to_member_id = p_to_member_id and campaign_week = v_week;
  if v_pair_count >= 1 then
    raise exception 'pair_limit_reached';
  end if;

  select count(*) into v_recipient_count from kindness_logs
    where to_member_id = p_to_member_id and campaign_week = v_week;
  if v_recipient_count >= 3 then
    raise exception 'recipient_limit_reached';
  end if;

  insert into kindness_logs (campaign_id, from_member_id, to_member_id, category, message, campaign_week)
  values (v_campaign.id, v_from_member_id, p_to_member_id, p_category, p_message, v_week)
  returning id into v_kindness_id;

  insert into points_transactions (member_id, points, source, source_ref_id)
  values (p_to_member_id, 10, 'kindness', v_kindness_id);

  insert into stickers (member_id, color, amount, source, source_ref_id)
  values (p_to_member_id, 'rainbow', 1, 'kindness', v_kindness_id);

  -- NEW in Sprint 4: automatic badge check for the recipient.
  perform check_achievements(p_to_member_id);

  return jsonb_build_object('success', true, 'message', 'ส่งความห่วงใยสำเร็จ!');
end;
$$;

grant execute on function give_kindness(uuid, kindness_category, text) to authenticated;
