-- ============================================================
-- BADGE SYSTEM REDESIGN — theme-based, replacing level-based
-- Confirmed with user: old 90 ME/WE/US badges are being retired
-- entirely (member_badges cascade-deletes automatically), replaced
-- by badges organized around 5 cross-cutting wellness themes.
--
-- `theme` is added to missions (separate from `category`, which
-- stays untouched — category still exists for the original 12
-- missions, just no longer drives badge criteria).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Assign themes to every mission by name (safest match, since
-- names are unique and known exactly).
-- ------------------------------------------------------------
alter table missions add column if not exists theme text check (theme in ('move', 'fuel', 'rest', 'mind', 'connect'));

update missions set theme = 'move' where name in ('Move Me', 'Big Step Challenge', 'Buddy Walk', 'Buddy Stretch', 'เดิน 15 นาทีหลังกินข้าว', 'ยืดเหยียดกล้ามเนื้อ', 'ยืดเหยียดก่อนกินข้าวแบบหมู่คณะ');
update missions set theme = 'fuel' where name in ('Eat Me', 'Buddy Lunch', 'Zero Sugar Squad', 'นับแก้วน้ำดื่ม');
update missions set theme = 'rest' where name in ('Sleep Me');
update missions set theme = 'mind' where name in ('Know Me', 'Gratitude', 'งดใช้มือถือ 1 ชั่วโมง', 'แบบทดสอบภาวะรับรู้ทางอารมณ์', 'ประเมินพฤติกรรมตนเอง + วางแผนปรับพฤติกรรม', 'เข้าร่วมกิจกรรมทางศาสนา', 'ชมคลิปวิดีโอ + ตอบคำถามท้ายคลิป');
update missions set theme = 'connect' where name in ('Hydration Buddy', 'Lunch Walk & Talk', 'Proud Moment');

-- ------------------------------------------------------------
-- 2. get_badge_measurements() — completely rewritten to compute
-- per-THEME stats (streak/completions/points/distinct missions)
-- instead of per-level. check_achievements()/get_badge_progress()
-- need NO changes to their own code — they already read
-- condition_field paths generically via jsonb path lookup,
-- regardless of what the path names are.
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
  v_streak int; v_completions int; v_points numeric; v_distinct int;
  v_move jsonb; v_fuel jsonb; v_rest jsonb; v_mind jsonb; v_connect jsonb;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is null then
    return jsonb_build_object(
      'move', jsonb_build_object('streak_weeks',0,'total_completions',0,'total_points',0,'distinct_missions',0),
      'fuel', jsonb_build_object('streak_weeks',0,'total_completions',0,'total_points',0,'distinct_missions',0),
      'rest', jsonb_build_object('streak_weeks',0,'total_completions',0,'total_points',0),
      'mind', jsonb_build_object('streak_weeks',0,'total_completions',0,'total_points',0,'distinct_missions',0),
      'connect', jsonb_build_object('streak_weeks',0,'total_completions',0,'total_points',0,'distinct_missions',0),
      'kindness_received', 0, 'campaign_finished', false
    );
  end if;

  -- move
  select count(distinct ci.campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'move';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'move';
  select coalesce(sum(pt.points), 0) into v_points from points_transactions pt
    join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.theme = 'move';
  select count(distinct ci.mission_id) into v_distinct from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'move';
  v_move := jsonb_build_object('streak_weeks', v_streak, 'total_completions', v_completions, 'total_points', v_points, 'distinct_missions', v_distinct);

  -- fuel
  select count(distinct ci.campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'fuel';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'fuel';
  select coalesce(sum(pt.points), 0) into v_points from points_transactions pt
    join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.theme = 'fuel';
  select count(distinct ci.mission_id) into v_distinct from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'fuel';
  v_fuel := jsonb_build_object('streak_weeks', v_streak, 'total_completions', v_completions, 'total_points', v_points, 'distinct_missions', v_distinct);

  -- rest (only 1 mission — no distinct_missions family)
  select count(distinct ci.campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'rest';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'rest';
  select coalesce(sum(pt.points), 0) into v_points from points_transactions pt
    join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.theme = 'rest';
  v_rest := jsonb_build_object('streak_weeks', v_streak, 'total_completions', v_completions, 'total_points', v_points);

  -- mind
  select count(distinct ci.campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'mind';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'mind';
  select coalesce(sum(pt.points), 0) into v_points from points_transactions pt
    join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.theme = 'mind';
  select count(distinct ci.mission_id) into v_distinct from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'mind';
  v_mind := jsonb_build_object('streak_weeks', v_streak, 'total_completions', v_completions, 'total_points', v_points, 'distinct_missions', v_distinct);

  -- connect
  select count(distinct ci.campaign_week) into v_streak from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'connect';
  select count(*) into v_completions from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'connect';
  select coalesce(sum(pt.points), 0) into v_points from points_transactions pt
    join check_ins ci on ci.id = pt.source_ref_id join missions m on m.id = ci.mission_id
    where pt.member_id = p_member_id and pt.source = 'mission' and m.theme = 'connect';
  select count(distinct ci.mission_id) into v_distinct from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.theme = 'connect';
  v_connect := jsonb_build_object('streak_weeks', v_streak, 'total_completions', v_completions, 'total_points', v_points, 'distinct_missions', v_distinct);

  select count(*) into v_kindness_received
    from kindness_logs where to_member_id = p_member_id and campaign_id = v_campaign.id;

  return jsonb_build_object(
    'move', v_move, 'fuel', v_fuel, 'rest', v_rest, 'mind', v_mind, 'connect', v_connect,
    'kindness_received', v_kindness_received,
    'campaign_finished', current_date > v_campaign.end_date
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Retire the old 90 badges (member_badges cascades away too —
-- confirmed acceptable with the user) and seed new theme-based ones.
-- badges.level is no longer meaningful going forward; badges.theme
-- (new column) replaces it as the grouping key for the UI.
-- ------------------------------------------------------------
alter table badges add column if not exists theme text check (theme in ('move', 'fuel', 'rest', 'mind', 'connect'));

delete from badges;

do $$
declare
  v_theme text;
  v_theme_th text;
  v_has_distinct boolean;
  v_distinct_max int;
  v_points_bulk int; v_points_lean int; v_points_smart int;
begin
  for v_theme, v_theme_th, v_has_distinct, v_distinct_max, v_points_bulk, v_points_lean, v_points_smart in
    values
      ('move', 'นักเคลื่อนไหว', true, 7, 50, 150, 300),
      ('fuel', 'นักกินดี', true, 4, 40, 120, 220),
      ('rest', 'นักพักผ่อน', false, 0, 30, 70, 120),
      ('mind', 'นักดูแลใจ', true, 7, 30, 100, 200),
      ('connect', 'นักเชื่อมสัมพันธ์', true, 3, 30, 80, 150)
  loop
    -- ขยันต่อเนื่อง (streak)
    insert into badges (code, family_code, tier, theme, name, description, icon, condition_field, target_value) values
      (v_theme||'_streak_bulk', v_theme||'_streak', 'bulk', v_theme, v_theme_th||' ต่อเนื่อง 🥉', 'ทำภารกิจกลุ่มนี้อย่างน้อย 1 อย่างต่อสัปดาห์ ติดต่อกัน 2 สัปดาห์', '🔥', v_theme||'.streak_weeks', 2),
      (v_theme||'_streak_lean', v_theme||'_streak', 'lean', v_theme, v_theme_th||' ต่อเนื่อง 🥈', 'ทำภารกิจกลุ่มนี้อย่างน้อย 1 อย่างต่อสัปดาห์ ติดต่อกัน 3 สัปดาห์', '🔥', v_theme||'.streak_weeks', 3),
      (v_theme||'_streak_smart', v_theme||'_streak', 'smart', v_theme, v_theme_th||' ต่อเนื่อง 🥇', 'ทำภารกิจกลุ่มนี้อย่างน้อย 1 อย่างต่อสัปดาห์ ติดต่อกัน 5 สัปดาห์', '🔥', v_theme||'.streak_weeks', 5);

    -- สม่ำเสมอ (total completions)
    insert into badges (code, family_code, tier, theme, name, description, icon, condition_field, target_value) values
      (v_theme||'_completions_bulk', v_theme||'_completions', 'bulk', v_theme, v_theme_th||' สม่ำเสมอ 🥉', 'ทำภารกิจกลุ่มนี้ (ข้อใดก็ได้) สำเร็จรวม 4 ครั้ง', '✅', v_theme||'.total_completions', 4),
      (v_theme||'_completions_lean', v_theme||'_completions', 'lean', v_theme, v_theme_th||' สม่ำเสมอ 🥈', 'ทำภารกิจกลุ่มนี้ (ข้อใดก็ได้) สำเร็จรวม 12 ครั้ง', '✅', v_theme||'.total_completions', 12),
      (v_theme||'_completions_smart', v_theme||'_completions', 'smart', v_theme, v_theme_th||' สม่ำเสมอ 🥇', 'ทำภารกิจกลุ่มนี้ (ข้อใดก็ได้) สำเร็จรวม 20 ครั้ง', '✅', v_theme||'.total_completions', 20);

    -- สะสมแต้ม (total points, theme-scaled)
    insert into badges (code, family_code, tier, theme, name, description, icon, condition_field, target_value) values
      (v_theme||'_points_bulk', v_theme||'_points', 'bulk', v_theme, v_theme_th||' สะสมแต้ม 🥉', 'สะสมคะแนนจากภารกิจกลุ่มนี้รวม '||v_points_bulk||' คะแนน', '⭐', v_theme||'.total_points', v_points_bulk),
      (v_theme||'_points_lean', v_theme||'_points', 'lean', v_theme, v_theme_th||' สะสมแต้ม 🥈', 'สะสมคะแนนจากภารกิจกลุ่มนี้รวม '||v_points_lean||' คะแนน', '⭐', v_theme||'.total_points', v_points_lean),
      (v_theme||'_points_smart', v_theme||'_points', 'smart', v_theme, v_theme_th||' สะสมแต้ม 🥇', 'สะสมคะแนนจากภารกิจกลุ่มนี้รวม '||v_points_smart||' คะแนน', '⭐', v_theme||'.total_points', v_points_smart);

    -- หลากหลาย (distinct missions tried) — skipped for themes with only 1 mission
    if v_has_distinct then
      insert into badges (code, family_code, tier, theme, name, description, icon, condition_field, target_value) values
        (v_theme||'_variety_bulk', v_theme||'_variety', 'bulk', v_theme, v_theme_th||' หลากหลาย 🥉', 'ลองทำภารกิจในกลุ่มนี้อย่างน้อย 2 แบบที่ต่างกัน', '🎯', v_theme||'.distinct_missions', 2),
        (v_theme||'_variety_lean', v_theme||'_variety', 'lean', v_theme, v_theme_th||' หลากหลาย 🥈', 'ลองทำภารกิจในกลุ่มนี้อย่างน้อย '||least(v_distinct_max-1, greatest(2, v_distinct_max/2))||' แบบที่ต่างกัน', '🎯', v_theme||'.distinct_missions', least(v_distinct_max - 1, greatest(2, v_distinct_max/2))),
        (v_theme||'_variety_smart', v_theme||'_variety', 'smart', v_theme, v_theme_th||' หลากหลาย 🥇', 'ลองทำภารกิจในกลุ่มนี้ครบทุกแบบ ('||v_distinct_max||' แบบ)', '🎯', v_theme||'.distinct_missions', v_distinct_max);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. admin_upsert_badge() — p_level renamed to p_theme. Postgres
-- rejects CREATE OR REPLACE when a parameter NAME changes even if
-- the type stays the same, so DROP first (confirmed by the actual
-- error hit when this was tried without it).
-- ------------------------------------------------------------
drop function if exists admin_upsert_badge(uuid, text, text, text, text, text, text, text, numeric, text);

create or replace function admin_upsert_badge(
  p_id uuid,
  p_family_code text,
  p_tier text,
  p_theme text,
  p_name text,
  p_description text,
  p_icon text,
  p_condition_field text,
  p_target_value numeric,
  p_icon_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_valid_fields text[] := array['streak_weeks', 'total_completions', 'total_points', 'distinct_missions'];
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
  if p_theme not in ('move', 'fuel', 'rest', 'mind', 'connect') then
    raise exception 'invalid_theme';
  end if;
  if p_target_value <= 0 then
    raise exception 'target_must_be_positive';
  end if;

  v_field_suffix := split_part(p_condition_field, '.', 2);
  if split_part(p_condition_field, '.', 1) <> p_theme or not (v_field_suffix = any(v_valid_fields)) then
    raise exception 'invalid_condition_field';
  end if;
  if p_theme = 'rest' and v_field_suffix = 'distinct_missions' then
    raise exception 'invalid_condition_field';
  end if;

  if p_id is null then
    insert into badges (code, family_code, tier, theme, name, description, icon, icon_url, condition_field, target_value)
    values (
      p_family_code || '_' || p_tier || '_' || extract(epoch from now())::bigint,
      p_family_code, p_tier, p_theme, p_name, p_description, p_icon, p_icon_url, p_condition_field, p_target_value
    )
    returning id into v_new_id;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('created', true, 'name', p_name));
  else
    update badges set
      family_code = p_family_code, tier = p_tier, theme = p_theme,
      name = p_name, description = p_description, icon = p_icon, icon_url = p_icon_url,
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

grant execute on function admin_upsert_badge(uuid, text, text, text, text, text, text, text, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 5. get_badge_progress() — return theme instead of level. Same
-- signature (p_member_id uuid default null), no DROP needed.
-- ------------------------------------------------------------
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
          'theme', b.theme,
          'name', b.name,
          'description', b.description,
          'icon', b.icon,
          'icon_url', b.icon_url,
          'unlocked', (mb.member_id is not null),
          'unlocked_at', mb.unlocked_at,
          'current_value', least(
            coalesce((v_measurements #>> string_to_array(b.condition_field, '.'))::numeric, 0),
            b.target_value
          ),
          'target_value', b.target_value
        )
        order by b.theme, b.family_code, b.target_value
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
