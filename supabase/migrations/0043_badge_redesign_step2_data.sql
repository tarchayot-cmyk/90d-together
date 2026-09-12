-- ============================================================
-- Badge Redesign STEP 2 — add the 2 missing one-tier ME badges
-- (เริ่มต้นดี, จบเฟสสวย). Additive only — the 8 existing ME badge
-- families and all WE/US badges are completely untouched.
-- ============================================================

-- 1. get_badge_measurements() — add first_week_done / last_week_done
-- under "me". Everything else in the function is unchanged from 0038.
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
  v_me jsonb; v_we jsonb; v_us jsonb;
  v_m1 int; v_m2 int; v_m3 int; v_m4 int;
  v_all int; v_streak int; v_steps numeric; v_completions int; v_types int; v_points numeric;
  v_first_week_done boolean := false;
  v_last_week_done boolean := false;
  v_me_last_week int;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is null then
    v_me := jsonb_build_object(
      'move_me_weeks', 0, 'sleep_me_weeks', 0, 'eat_me_weeks', 0, 'know_me_weeks', 0,
      'all_complete_weeks', 0, 'streak_weeks', 0, 'total_steps', 0, 'total_completions', 0,
      'distinct_types', 0, 'total_points', 0, 'first_week_done', 0, 'last_week_done', 0
    );
    v_we := jsonb_build_object(
      'buddy_walk_weeks', 0, 'buddy_lunch_weeks', 0, 'hydration_buddy_weeks', 0, 'buddy_stretch_weeks', 0,
      'all_complete_weeks', 0, 'streak_weeks', 0, 'total_steps', 0, 'total_completions', 0,
      'distinct_types', 0, 'total_points', 0
    );
    v_us := jsonb_build_object(
      'big_step_weeks', 0, 'zero_sugar_weeks', 0, 'lunch_walk_weeks', 0, 'gratitude_weeks', 0,
      'all_complete_weeks', 0, 'streak_weeks', 0, 'total_steps', 0, 'total_completions', 0,
      'distinct_types', 0, 'total_points', 0
    );
    return jsonb_build_object('me', v_me, 'we', v_we, 'us', v_us, 'kindness_received', 0, 'campaign_finished', false);
  end if;

  -- ===== ME =====
  select count(distinct campaign_week) into v_m1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and m.category = 'move_me';
  select count(distinct campaign_week) into v_m2 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and m.category = 'sleep_me';
  select count(distinct campaign_week) into v_m3 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and m.category = 'eat_me';
  select count(distinct campaign_week) into v_m4 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and m.category = 'know_me';
  select count(*) into v_all from (
    select ci.campaign_week from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me'
    group by ci.campaign_week having count(distinct m.category) >= 4
  ) sub;
  select count(distinct campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me';
  select coalesce(sum(ci.value), 0) into v_steps from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and m.category = 'move_me';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me';
  select count(distinct m.category) into v_types from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me';
  select coalesce(sum(pt.points), 0) into v_points
    from points_transactions pt join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.level = 'me';

  -- NEW: first/last ME week completion (ME's own week window is
  -- always weeks 1 through ceil(30/7)=5, regardless of the overall
  -- campaign week count, since ME missions only ever run in that range).
  v_me_last_week := ceil(30::numeric / 7)::int;

  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and ci.campaign_week = 1
  ) into v_first_week_done;

  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and ci.campaign_week = v_me_last_week
  ) into v_last_week_done;

  v_me := jsonb_build_object(
    'move_me_weeks', v_m1, 'sleep_me_weeks', v_m2, 'eat_me_weeks', v_m3, 'know_me_weeks', v_m4,
    'all_complete_weeks', v_all, 'streak_weeks', v_streak, 'total_steps', v_steps,
    'total_completions', v_completions, 'distinct_types', v_types, 'total_points', v_points,
    'first_week_done', (case when v_first_week_done then 1 else 0 end),
    'last_week_done', (case when v_last_week_done then 1 else 0 end)
  );

  -- ===== WE ===== (unchanged from 0038)
  select count(distinct campaign_week) into v_m1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we' and m.category = 'buddy_walk';
  select count(distinct campaign_week) into v_m2 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we' and m.category = 'buddy_lunch';
  select count(distinct campaign_week) into v_m3 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we' and m.category = 'hydration_buddy';
  select count(distinct campaign_week) into v_m4 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we' and m.category = 'buddy_stretch';
  select count(*) into v_all from (
    select ci.campaign_week from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we'
    group by ci.campaign_week having count(distinct m.category) >= 4
  ) sub;
  select count(distinct campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we';
  select coalesce(sum(ci.value), 0) into v_steps from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we' and m.category = 'buddy_walk';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we';
  select count(distinct m.category) into v_types from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we';
  select coalesce(sum(pt.points), 0) into v_points
    from points_transactions pt join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.level = 'we';

  v_we := jsonb_build_object(
    'buddy_walk_weeks', v_m1, 'buddy_lunch_weeks', v_m2, 'hydration_buddy_weeks', v_m3, 'buddy_stretch_weeks', v_m4,
    'all_complete_weeks', v_all, 'streak_weeks', v_streak, 'total_steps', v_steps,
    'total_completions', v_completions, 'distinct_types', v_types, 'total_points', v_points
  );

  -- ===== US ===== (unchanged from 0038)
  select count(distinct campaign_week) into v_m1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us' and m.category = 'big_step';
  select count(distinct campaign_week) into v_m2 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us' and m.category = 'zero_sugar_squad';
  select count(distinct campaign_week) into v_m3 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us' and m.category = 'lunch_walk_talk';
  select count(distinct campaign_week) into v_m4 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us' and m.category = 'gratitude';
  select count(*) into v_all from (
    select ci.campaign_week from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us'
    group by ci.campaign_week having count(distinct m.category) >= 4
  ) sub;
  select count(distinct campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us';
  select coalesce(sum(ci.value), 0) into v_steps from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us' and m.category = 'big_step';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us';
  select count(distinct m.category) into v_types from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us';
  select coalesce(sum(pt.points), 0) into v_points
    from points_transactions pt join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.level = 'us';

  v_us := jsonb_build_object(
    'big_step_weeks', v_m1, 'zero_sugar_weeks', v_m2, 'lunch_walk_weeks', v_m3, 'gratitude_weeks', v_m4,
    'all_complete_weeks', v_all, 'streak_weeks', v_streak, 'total_steps', v_steps,
    'total_completions', v_completions, 'distinct_types', v_types, 'total_points', v_points
  );

  select count(*) into v_kindness_received
    from kindness_logs where to_member_id = p_member_id and campaign_id = v_campaign.id;

  v_campaign_finished := current_date > v_campaign.end_date;

  return jsonb_build_object(
    'me', v_me, 'we', v_we, 'us', v_us,
    'kindness_received', v_kindness_received,
    'campaign_finished', v_campaign_finished
  );
end;
$$;

-- 2. The 2 missing badges — single tier ('bulk' only), per spec.
insert into badges (code, family_code, tier, level, name, description, icon, condition_field, target_value)
values
  ('me_start_bulk', 'me_start', 'bulk', 'me', 'เริ่มต้นดี', 'ทำสำเร็จอย่างน้อย 1 ภารกิจในสัปดาห์แรกของ ME', '🌅', 'me.first_week_done', 1),
  ('me_finish_bulk', 'me_finish', 'bulk', 'me', 'จบเฟสสวย', 'ทำสำเร็จอย่างน้อย 1 ภารกิจในสัปดาห์สุดท้ายของ ME', '🏁', 'me.last_week_done', 1)
on conflict (code) do nothing;
