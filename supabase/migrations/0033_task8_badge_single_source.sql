-- ============================================================
-- TASK 8 — Badge Single Source of Truth
-- Before: check_achievements() (0004) and get_badge_progress()
-- (0028) each hardcoded their own copy of the same 6 thresholds.
-- After: thresholds live as data on the `badges` table itself, and
-- the raw measurements (streak weeks, weekly missions, etc.) come
-- from ONE new function both callers share. Existing earned badges
-- (member_badges rows) are completely untouched.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Criteria now live as data, not hardcoded logic. Additive
-- columns, then backfilled for the 6 existing badges by code — no
-- large migration, just 2 nullable columns + 6 UPDATEs.
-- ------------------------------------------------------------
alter table badges add column if not exists condition_field text;
alter table badges add column if not exists target_value numeric;

update badges set condition_field = 'streak_weeks', target_value = 7 where code = '7_day_warrior';
update badges set condition_field = 'weekly_missions', target_value = 4 where code = 'consistency_master';
update badges set condition_field = 'buddy_missions', target_value = 3 where code = 'buddy_hero';
update badges set condition_field = 'squad_success', target_value = 1 where code = 'squad_champion';
update badges set condition_field = 'kindness_received', target_value = 5 where code = 'kindness_star';
update badges set condition_field = 'campaign_finished', target_value = 1 where code = '90_day_finisher';

-- ------------------------------------------------------------
-- 2. get_badge_measurements() — the ONE place all 6 raw numbers are
-- computed. Internal-only (not granted to `authenticated`) — same
-- pattern as check_achievements() itself: only callable from other
-- trusted SECURITY DEFINER functions.
-- ------------------------------------------------------------
create or replace function get_badge_measurements(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_current_week int;
  v_streak_weeks int := 0;
  v_weekly_missions int := 0;
  v_buddy_missions int := 0;
  v_squad_success boolean := false;
  v_kindness_received int := 0;
  v_campaign_finished boolean := false;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is not null then
    v_current_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

    select count(distinct campaign_week) into v_streak_weeks
      from check_ins where member_id = p_member_id and completed_at is not null;

    select count(*) into v_weekly_missions
      from check_ins
      where member_id = p_member_id and completed_at is not null and campaign_week = v_current_week;

    select count(*) into v_buddy_missions
      from check_ins ci join missions m on m.id = ci.mission_id
      where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we';

    select exists (
      select 1 from check_ins ci join missions m on m.id = ci.mission_id
      where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us'
    ) into v_squad_success;

    select count(*) into v_kindness_received
      from kindness_logs where to_member_id = p_member_id and campaign_id = v_campaign.id;

    v_campaign_finished := current_date > v_campaign.end_date;
  end if;

  return jsonb_build_object(
    'streak_weeks', v_streak_weeks,
    'weekly_missions', v_weekly_missions,
    'buddy_missions', v_buddy_missions,
    'squad_success', v_squad_success,
    'kindness_received', v_kindness_received,
    'campaign_finished', v_campaign_finished,
    'campaign_day', case when v_campaign.id is not null then greatest(0, current_date - v_campaign.start_date + 1) else 0 end
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. check_achievements() — now loops over `badges` generically
-- instead of a hardcoded array of 6 conditions. Same unlock
-- behavior, same insert-once-only semantics, same return shape.
-- ------------------------------------------------------------
create or replace function check_achievements(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_measurements jsonb;
  v_newly_unlocked jsonb := '[]'::jsonb;
  v_badge record;
  v_already boolean;
  v_meets boolean;
begin
  v_measurements := get_badge_measurements(p_member_id);

  for v_badge in select id, code, condition_field, target_value from badges where condition_field is not null loop
    if v_badge.condition_field in ('squad_success', 'campaign_finished') then
      v_meets := coalesce((v_measurements ->> v_badge.condition_field)::boolean, false);
    else
      v_meets := coalesce((v_measurements ->> v_badge.condition_field)::numeric, 0) >= v_badge.target_value;
    end if;

    continue when not v_meets;

    select exists (
      select 1 from member_badges where member_id = p_member_id and badge_id = v_badge.id
    ) into v_already;

    if not v_already then
      insert into member_badges (member_id, badge_id) values (p_member_id, v_badge.id)
        on conflict do nothing;
      v_newly_unlocked := v_newly_unlocked || jsonb_build_object('code', v_badge.code);
    end if;
  end loop;

  return v_newly_unlocked;
end;
$$;

-- Still internal-only — not granted to `authenticated`, unchanged
-- from Task 1's original design (only callable from other trusted
-- SECURITY DEFINER functions like complete_mission()/give_kindness()).

-- ------------------------------------------------------------
-- 4. get_badge_progress() — reads the SAME measurements +
-- badges.target_value the unlock check just used, instead of its
-- own hardcoded copy. The two boolean-type badges (squad_champion,
-- 90_day_finisher) still get a friendlier progress display (0/1 and
-- day-X-of-90 respectively) — that's presentation only; the unlock
-- decision above already used the real boolean.
-- ------------------------------------------------------------
create or replace function get_badge_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_measurements jsonb;
  v_campaign_day numeric;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  v_measurements := get_badge_measurements(v_member_id);
  v_campaign_day := coalesce((v_measurements ->> 'campaign_day')::numeric, 0);

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', b.code,
          'name', b.name,
          'description', b.description,
          'icon', b.icon,
          'unlocked', (mb.member_id is not null),
          'unlocked_at', mb.unlocked_at,
          'current_value', case
            when b.condition_field = 'squad_success' then
              case when coalesce((v_measurements ->> 'squad_success')::boolean, false) then 1 else 0 end
            when b.condition_field = 'campaign_finished' then
              least(v_campaign_day, 90)
            else
              least(coalesce((v_measurements ->> b.condition_field)::numeric, 0), b.target_value)
          end,
          'target_value', case
            when b.condition_field = 'campaign_finished' then 90
            else b.target_value
          end
        )
        order by b.created_at
      ),
      '[]'::jsonb
    )
    from badges b
    left join member_badges mb on mb.badge_id = b.id and mb.member_id = v_member_id
    where b.condition_field is not null
  );
end;
$$;

grant execute on function get_badge_progress() to authenticated;
