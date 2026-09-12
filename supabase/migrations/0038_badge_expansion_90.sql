-- ============================================================
-- Badge System Expansion — 90 tiered badges (10 families x 3 tiers
-- [bulk/lean/smart] x 3 levels [me/we/us]), replacing the old 6.
--
-- Design: condition_field is now a dot-separated path into a richer
-- nested measurement object (e.g. "me.move_me_weeks",
-- "we.total_points") instead of a flat key. Both check_achievements()
-- and get_badge_progress() still read from the SAME
-- get_badge_measurements() function (Task 8's single-source-of-truth
-- principle preserved, just with a richer vocabulary underneath it).
--
-- Admin can create/edit/delete badge DEFINITIONS by picking a
-- level + condition_field from this fixed vocabulary and setting a
-- target number — not by writing arbitrary logic. This keeps the
-- "Admin edits conditions" feature safe.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema: badges gets family_code/tier/level. Old 6 badges are
-- removed — member_badges rows for them cascade-delete
-- automatically (explicit choice, confirmed with you: the old set
-- is being replaced, not kept alongside the new one).
-- ------------------------------------------------------------
alter table badges add column if not exists family_code text;
alter table badges add column if not exists tier text check (tier in ('bulk', 'lean', 'smart'));
alter table badges add column if not exists level campaign_level;

delete from badges; -- cascades member_badges for the retired 6

-- ------------------------------------------------------------
-- 2. Seed all 90 badges. Tiers scale the same way across all 3
-- levels for consistency (all three phases are the same length —
-- ~5 weeks each) except total_steps/total_points, which use each
-- level's actual points-per-mission scale (ME=10, WE=20, US=30).
-- ------------------------------------------------------------
do $$
declare
  v_level campaign_level;
  v_prefix text;
  v_mission_1 text; v_mission_1_th text;
  v_mission_2 text; v_mission_2_th text;
  v_mission_3 text; v_mission_3_th text;
  v_mission_4 text; v_mission_4_th text;
  v_points_per_mission int;
  v_step_mission_th text;
  v_all_th text; v_streak_th text; v_steps_th text; v_completions_th text; v_types_th text; v_points_th text;
begin
  for v_level, v_prefix, v_mission_1, v_mission_1_th, v_mission_2, v_mission_2_th,
      v_mission_3, v_mission_3_th, v_mission_4, v_mission_4_th, v_points_per_mission,
      v_step_mission_th, v_all_th, v_streak_th, v_steps_th, v_completions_th, v_types_th, v_points_th
  in
    values
      ('me'::campaign_level, 'me', 'move_me_weeks', 'นักก้าวเดิน', 'sleep_me_weeks', 'นักนอนหลับ',
       'eat_me_weeks', 'นักกินดี', 'know_me_weeks', 'รู้จักตัวเอง', 10,
       'สะสมก้าว', 'ครบเซ็ต', 'ขยันไม่หยุด', 'สะสมก้าว (ME)', 'นักวินัย', 'ครบทุกมิติ', 'จัดเต็ม'),
      ('we'::campaign_level, 'we', 'buddy_walk_weeks', 'เพื่อนซี้เดินเพลิน', 'buddy_lunch_weeks', 'มื้อเพื่อสุขภาพ',
       'hydration_buddy_weeks', 'คู่หูจิบน้ำ', 'buddy_stretch_weeks', 'ยืดเส้นด้วยกัน', 20,
       'ก้าวไปด้วยกัน', 'ครบเซ็ตคู่หู', 'เพื่อนไม่ทิ้งกัน', 'ก้าวไปด้วยกัน (WE)', 'คู่หูขยัน', 'คู่หูรอบด้าน', 'พลังคู่หู'),
      ('us'::campaign_level, 'us', 'big_step_weeks', 'นักวิ่งทีม', 'zero_sugar_weeks', 'ทีมไร้น้ำตาล',
       'lunch_walk_weeks', 'เดินคุยสบายใจ', 'gratitude_weeks', 'นักขอบคุณ', 30,
       'พลังก้าวทีม', 'ครบเซ็ตทีม', 'ทีมไม่ทิ้งกัน', 'พลังก้าวทีม (US)', 'นักสู้ทีม', 'ทีมรอบด้าน', 'สุดยอดทีม')
  loop
    -- 4 per-mission-category badges (weeks completed): 1 / 3 / 5
    insert into badges (code, family_code, tier, level, name, description, icon, condition_field, target_value) values
      (v_prefix||'_m1_bulk',  v_prefix||'_m1', 'bulk',  v_level, v_mission_1_th||' 🥉', 'ทำสำเร็จ 1 สัปดาห์', '🥉', v_prefix||'.'||v_mission_1, 1),
      (v_prefix||'_m1_lean',  v_prefix||'_m1', 'lean',  v_level, v_mission_1_th||' 🥈', 'ทำสำเร็จ 3 สัปดาห์', '🥈', v_prefix||'.'||v_mission_1, 3),
      (v_prefix||'_m1_smart', v_prefix||'_m1', 'smart', v_level, v_mission_1_th||' 🥇', 'ทำสำเร็จครบ 5 สัปดาห์', '🥇', v_prefix||'.'||v_mission_1, 5),

      (v_prefix||'_m2_bulk',  v_prefix||'_m2', 'bulk',  v_level, v_mission_2_th||' 🥉', 'ทำสำเร็จ 1 สัปดาห์', '🥉', v_prefix||'.'||v_mission_2, 1),
      (v_prefix||'_m2_lean',  v_prefix||'_m2', 'lean',  v_level, v_mission_2_th||' 🥈', 'ทำสำเร็จ 3 สัปดาห์', '🥈', v_prefix||'.'||v_mission_2, 3),
      (v_prefix||'_m2_smart', v_prefix||'_m2', 'smart', v_level, v_mission_2_th||' 🥇', 'ทำสำเร็จครบ 5 สัปดาห์', '🥇', v_prefix||'.'||v_mission_2, 5),

      (v_prefix||'_m3_bulk',  v_prefix||'_m3', 'bulk',  v_level, v_mission_3_th||' 🥉', 'ทำสำเร็จ 1 สัปดาห์', '🥉', v_prefix||'.'||v_mission_3, 1),
      (v_prefix||'_m3_lean',  v_prefix||'_m3', 'lean',  v_level, v_mission_3_th||' 🥈', 'ทำสำเร็จ 3 สัปดาห์', '🥈', v_prefix||'.'||v_mission_3, 3),
      (v_prefix||'_m3_smart', v_prefix||'_m3', 'smart', v_level, v_mission_3_th||' 🥇', 'ทำสำเร็จครบ 5 สัปดาห์', '🥇', v_prefix||'.'||v_mission_3, 5),

      (v_prefix||'_m4_bulk',  v_prefix||'_m4', 'bulk',  v_level, v_mission_4_th||' 🥉', 'ทำสำเร็จ 1 สัปดาห์', '🥉', v_prefix||'.'||v_mission_4, 1),
      (v_prefix||'_m4_lean',  v_prefix||'_m4', 'lean',  v_level, v_mission_4_th||' 🥈', 'ทำสำเร็จ 3 สัปดาห์', '🥈', v_prefix||'.'||v_mission_4, 3),
      (v_prefix||'_m4_smart', v_prefix||'_m4', 'smart', v_level, v_mission_4_th||' 🥇', 'ทำสำเร็จครบ 5 สัปดาห์', '🥇', v_prefix||'.'||v_mission_4, 5),

      -- ครบเซ็ต: all 4 missions done in the same week
      (v_prefix||'_all_bulk',  v_prefix||'_all', 'bulk',  v_level, v_all_th||' 🥉', 'ทำครบ 4 ภารกิจใน 1 สัปดาห์', '🥉', v_prefix||'.all_complete_weeks', 1),
      (v_prefix||'_all_lean',  v_prefix||'_all', 'lean',  v_level, v_all_th||' 🥈', 'ทำครบ 4 ภารกิจ 3 สัปดาห์', '🥈', v_prefix||'.all_complete_weeks', 3),
      (v_prefix||'_all_smart', v_prefix||'_all', 'smart', v_level, v_all_th||' 🥇', 'ทำครบ 4 ภารกิจทุกสัปดาห์ (5)', '🥇', v_prefix||'.all_complete_weeks', 5),

      -- streak: consecutive weeks with >=1 completion
      (v_prefix||'_streak_bulk',  v_prefix||'_streak', 'bulk',  v_level, v_streak_th||' 🥉', 'ต่อเนื่อง 2 สัปดาห์', '🥉', v_prefix||'.streak_weeks', 2),
      (v_prefix||'_streak_lean',  v_prefix||'_streak', 'lean',  v_level, v_streak_th||' 🥈', 'ต่อเนื่อง 3 สัปดาห์', '🥈', v_prefix||'.streak_weeks', 3),
      (v_prefix||'_streak_smart', v_prefix||'_streak', 'smart', v_level, v_streak_th||' 🥇', 'ต่อเนื่องครบเฟส (5 สัปดาห์)', '🥇', v_prefix||'.streak_weeks', 5),

      -- total steps (the step-based mission in this level)
      (v_prefix||'_steps_bulk',  v_prefix||'_steps', 'bulk',  v_level, v_steps_th||' 🥉', 'สะสม 50,000 ก้าว', '🥉', v_prefix||'.total_steps', 50000),
      (v_prefix||'_steps_lean',  v_prefix||'_steps', 'lean',  v_level, v_steps_th||' 🥈', 'สะสม 150,000 ก้าว', '🥈', v_prefix||'.total_steps', 150000),
      (v_prefix||'_steps_smart', v_prefix||'_steps', 'smart', v_level, v_steps_th||' 🥇', 'สะสม 250,000 ก้าว', '🥇', v_prefix||'.total_steps', 250000),

      -- total completions across the whole level
      (v_prefix||'_completions_bulk',  v_prefix||'_completions', 'bulk',  v_level, v_completions_th||' 🥉', 'ทำสำเร็จรวม 4 ครั้ง', '🥉', v_prefix||'.total_completions', 4),
      (v_prefix||'_completions_lean',  v_prefix||'_completions', 'lean',  v_level, v_completions_th||' 🥈', 'ทำสำเร็จรวม 12 ครั้ง', '🥈', v_prefix||'.total_completions', 12),
      (v_prefix||'_completions_smart', v_prefix||'_completions', 'smart', v_level, v_completions_th||' 🥇', 'ทำสำเร็จรวม 20 ครั้ง', '🥇', v_prefix||'.total_completions', 20),

      -- distinct mission types tried at least once
      (v_prefix||'_types_bulk',  v_prefix||'_types', 'bulk',  v_level, v_types_th||' 🥉', 'ทำสำเร็จ 2 ประเภทต่างกัน', '🥉', v_prefix||'.distinct_types', 2),
      (v_prefix||'_types_lean',  v_prefix||'_types', 'lean',  v_level, v_types_th||' 🥈', 'ทำสำเร็จ 3 ประเภทต่างกัน', '🥈', v_prefix||'.distinct_types', 3),
      (v_prefix||'_types_smart', v_prefix||'_types', 'smart', v_level, v_types_th||' 🥇', 'ทำสำเร็จครบทั้ง 4 ประเภท', '🥇', v_prefix||'.distinct_types', 4),

      -- total points earned within this level
      (v_prefix||'_points_bulk',  v_prefix||'_points', 'bulk',  v_level, v_points_th||' 🥉', 'ได้ '||(v_points_per_mission*4)||' คะแนนในเฟสนี้', '🥉', v_prefix||'.total_points', v_points_per_mission * 4),
      (v_prefix||'_points_lean',  v_prefix||'_points', 'lean',  v_level, v_points_th||' 🥈', 'ได้ '||(v_points_per_mission*12)||' คะแนนในเฟสนี้', '🥈', v_prefix||'.total_points', v_points_per_mission * 12),
      (v_prefix||'_points_smart', v_prefix||'_points', 'smart', v_level, v_points_th||' 🥇', 'ได้ '||(v_points_per_mission*20)||' คะแนนในเฟสนี้', '🥇', v_prefix||'.total_points', v_points_per_mission * 20);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. get_badge_measurements() — rewritten with the richer nested
-- vocabulary. Still the ONE place raw numbers are computed; both
-- functions below read from it exactly as Task 8 established.
-- ------------------------------------------------------------
create or replace function get_badge_measurements(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_kindness_received int := 0;
  v_me jsonb; v_we jsonb; v_us jsonb;

  -- reusable per-level accumulators
  v_m1 int; v_m2 int; v_m3 int; v_m4 int;
  v_all int; v_streak int; v_steps numeric; v_completions int; v_types int; v_points numeric;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is null then
    v_me := jsonb_build_object(
      'move_me_weeks', 0, 'sleep_me_weeks', 0, 'eat_me_weeks', 0, 'know_me_weeks', 0,
      'all_complete_weeks', 0, 'streak_weeks', 0, 'total_steps', 0, 'total_completions', 0,
      'distinct_types', 0, 'total_points', 0
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

  v_me := jsonb_build_object(
    'move_me_weeks', v_m1, 'sleep_me_weeks', v_m2, 'eat_me_weeks', v_m3, 'know_me_weeks', v_m4,
    'all_complete_weeks', v_all, 'streak_weeks', v_streak, 'total_steps', v_steps,
    'total_completions', v_completions, 'distinct_types', v_types, 'total_points', v_points
  );

  -- ===== WE =====
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

  -- ===== US =====
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

  return jsonb_build_object(
    'me', v_me, 'we', v_we, 'us', v_us,
    'kindness_received', v_kindness_received,
    'campaign_finished', current_date > v_campaign.end_date
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. check_achievements() — reads condition_field as a dotted path
-- (e.g. "me.move_me_weeks") via the jsonb #>> path operator instead
-- of a flat key. Same insert-once-only semantics as before.
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
  v_current_value numeric;
begin
  v_measurements := get_badge_measurements(p_member_id);

  for v_badge in select id, code, condition_field, target_value from badges where condition_field is not null loop
    v_current_value := coalesce((v_measurements #>> string_to_array(v_badge.condition_field, '.'))::numeric, 0);

    continue when v_current_value < v_badge.target_value;

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

-- ------------------------------------------------------------
-- 5. get_badge_progress(p_member_id default null) — same path
-- lookup, now also returns family_code/tier/level so the frontend
-- can group the 3 tiers of each family together.
-- ------------------------------------------------------------
drop function if exists get_badge_progress(uuid);

create or replace function get_badge_progress(p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_target_id uuid;
  v_measurements jsonb;
begin
  v_caller_id := auth_member_id();
  if v_caller_id is null then
    raise exception 'not_authenticated';
  end if;

  v_target_id := coalesce(p_member_id, v_caller_id);

  if v_target_id <> v_caller_id and not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_measurements := get_badge_measurements(v_target_id);

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', b.code,
          'family_code', b.family_code,
          'tier', b.tier,
          'level', b.level,
          'name', b.name,
          'description', b.description,
          'icon', b.icon,
          'unlocked', (mb.member_id is not null),
          'unlocked_at', mb.unlocked_at,
          'current_value', least(
            coalesce((v_measurements #>> string_to_array(b.condition_field, '.'))::numeric, 0),
            b.target_value
          ),
          'target_value', b.target_value
        )
        order by b.level, b.family_code, b.target_value
      ),
      '[]'::jsonb
    )
    from badges b
    left join member_badges mb on mb.badge_id = b.id and mb.member_id = v_target_id
    where b.condition_field is not null
  );
end;
$$;

grant execute on function get_badge_progress(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. Admin CRUD for badge definitions. Admin picks level +
-- condition_field from the known vocabulary (validated against the
-- fixed list below) and sets a target number — never arbitrary logic.
-- ------------------------------------------------------------
create or replace function admin_upsert_badge(
  p_id uuid,
  p_family_code text,
  p_tier text,
  p_level text,
  p_name text,
  p_description text,
  p_icon text,
  p_condition_field text,
  p_target_value numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_valid_fields text[] := array[
    'move_me_weeks','sleep_me_weeks','eat_me_weeks','know_me_weeks',
    'buddy_walk_weeks','buddy_lunch_weeks','hydration_buddy_weeks','buddy_stretch_weeks',
    'big_step_weeks','zero_sugar_weeks','lunch_walk_weeks','gratitude_weeks',
    'all_complete_weeks','streak_weeks','total_steps','total_completions','distinct_types','total_points'
  ];
  v_field_suffix text;
  v_new_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_tier not in ('bulk', 'lean', 'smart') then
    raise exception 'invalid_tier';
  end if;
  if p_level not in ('me', 'we', 'us') then
    raise exception 'invalid_level';
  end if;
  if p_target_value <= 0 then
    raise exception 'target_must_be_positive';
  end if;

  v_field_suffix := split_part(p_condition_field, '.', 2);
  if split_part(p_condition_field, '.', 1) <> p_level or not (v_field_suffix = any(v_valid_fields)) then
    raise exception 'invalid_condition_field';
  end if;

  if p_id is null then
    insert into badges (code, family_code, tier, level, name, description, icon, condition_field, target_value)
    values (
      p_family_code || '_' || p_tier || '_' || extract(epoch from now())::bigint,
      p_family_code, p_tier, p_level::campaign_level, p_name, p_description, p_icon, p_condition_field, p_target_value
    )
    returning id into v_new_id;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('created', true, 'name', p_name));
  else
    update badges set
      family_code = p_family_code, tier = p_tier, level = p_level::campaign_level,
      name = p_name, description = p_description, icon = p_icon,
      condition_field = p_condition_field, target_value = p_target_value
    where id = p_id
    returning id into v_new_id;

    if v_new_id is null then
      raise exception 'badge_not_found';
    end if;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('updated', true, 'name', p_name));
  end if;

  return jsonb_build_object('success', true, 'badge_id', v_new_id);
end;
$$;

grant execute on function admin_upsert_badge(uuid, text, text, text, text, text, text, text, numeric) to authenticated;

create or replace function admin_delete_badge(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  delete from badges where id = p_id; -- cascades member_badges for this badge

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'badge', p_id, jsonb_build_object('deleted', true));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_delete_badge(uuid) to authenticated;
