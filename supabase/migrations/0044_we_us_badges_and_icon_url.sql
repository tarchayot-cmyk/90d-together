-- ============================================================
-- 1. WE/US "เริ่มต้นดี"/"จบเฟสสวย" equivalents — same pattern as ME,
-- single tier (bulk) only. WE's own week window is global campaign
-- weeks 5-9 (days 31-60), US's is weeks 9-13 (days 61-90) — computed
-- from ceil(day/7), same formula already used everywhere else.
-- ============================================================
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
  v_m1 int; v_m2 int; v_m3 int; v_m4 int;
  v_all int; v_streak int; v_steps numeric; v_completions int; v_types int; v_points numeric;
  v_first_week_done boolean; v_last_week_done boolean;
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
      'distinct_types', 0, 'total_points', 0, 'first_week_done', 0, 'last_week_done', 0
    );
    v_us := jsonb_build_object(
      'big_step_weeks', 0, 'zero_sugar_weeks', 0, 'lunch_walk_weeks', 0, 'gratitude_weeks', 0,
      'all_complete_weeks', 0, 'streak_weeks', 0, 'total_steps', 0, 'total_completions', 0,
      'distinct_types', 0, 'total_points', 0, 'first_week_done', 0, 'last_week_done', 0
    );
    return jsonb_build_object('me', v_me, 'we', v_we, 'us', v_us, 'kindness_received', 0, 'campaign_finished', false);
  end if;

  -- ===== ME ===== (unchanged from 0043)
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

  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and ci.campaign_week = 1
  ) into v_first_week_done;
  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'me' and ci.campaign_week = ceil(30::numeric / 7)::int
  ) into v_last_week_done;

  v_me := jsonb_build_object(
    'move_me_weeks', v_m1, 'sleep_me_weeks', v_m2, 'eat_me_weeks', v_m3, 'know_me_weeks', v_m4,
    'all_complete_weeks', v_all, 'streak_weeks', v_streak, 'total_steps', v_steps,
    'total_completions', v_completions, 'distinct_types', v_types, 'total_points', v_points,
    'first_week_done', (case when v_first_week_done then 1 else 0 end),
    'last_week_done', (case when v_last_week_done then 1 else 0 end)
  );

  -- ===== WE ===== (now with first/last week, like ME)
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

  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we' and ci.campaign_week = ceil(31::numeric / 7)::int
  ) into v_first_week_done;
  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'we' and ci.campaign_week = ceil(60::numeric / 7)::int
  ) into v_last_week_done;

  v_we := jsonb_build_object(
    'buddy_walk_weeks', v_m1, 'buddy_lunch_weeks', v_m2, 'hydration_buddy_weeks', v_m3, 'buddy_stretch_weeks', v_m4,
    'all_complete_weeks', v_all, 'streak_weeks', v_streak, 'total_steps', v_steps,
    'total_completions', v_completions, 'distinct_types', v_types, 'total_points', v_points,
    'first_week_done', (case when v_first_week_done then 1 else 0 end),
    'last_week_done', (case when v_last_week_done then 1 else 0 end)
  );

  -- ===== US ===== (now with first/last week, like ME)
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

  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us' and ci.campaign_week = ceil(61::numeric / 7)::int
  ) into v_first_week_done;
  select exists (
    select 1 from check_ins ci join missions m on m.id = ci.mission_id
    where ci.member_id = p_member_id and ci.completed_at is not null and m.level = 'us' and ci.campaign_week = ceil(90::numeric / 7)::int
  ) into v_last_week_done;

  v_us := jsonb_build_object(
    'big_step_weeks', v_m1, 'zero_sugar_weeks', v_m2, 'lunch_walk_weeks', v_m3, 'gratitude_weeks', v_m4,
    'all_complete_weeks', v_all, 'streak_weeks', v_streak, 'total_steps', v_steps,
    'total_completions', v_completions, 'distinct_types', v_types, 'total_points', v_points,
    'first_week_done', (case when v_first_week_done then 1 else 0 end),
    'last_week_done', (case when v_last_week_done then 1 else 0 end)
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

-- 4 new one-tier badges (WE start/finish, US start/finish)
insert into badges (code, family_code, tier, level, name, description, icon, condition_field, target_value)
values
  ('we_start_bulk', 'we_start', 'bulk', 'we', 'เริ่มต้นดี (WE)', 'ทำสำเร็จอย่างน้อย 1 ภารกิจในสัปดาห์แรกของ WE', '🌅', 'we.first_week_done', 1),
  ('we_finish_bulk', 'we_finish', 'bulk', 'we', 'จบเฟสสวย (WE)', 'ทำสำเร็จอย่างน้อย 1 ภารกิจในสัปดาห์สุดท้ายของ WE', '🏁', 'we.last_week_done', 1),
  ('us_start_bulk', 'us_start', 'bulk', 'us', 'เริ่มต้นดี (US)', 'ทำสำเร็จอย่างน้อย 1 ภารกิจในสัปดาห์แรกของ US', '🌅', 'us.first_week_done', 1),
  ('us_finish_bulk', 'us_finish', 'bulk', 'us', 'จบเฟสสวย (US)', 'ทำสำเร็จอย่างน้อย 1 ภารกิจในสัปดาห์สุดท้ายของ US', '🏁', 'us.last_week_done', 1)
on conflict (code) do nothing;

-- ============================================================
-- 2. icon_url support — future upgrade path for real illustration
-- assets. Nullable, additive. BadgeArtwork falls back to the emoji
-- `icon` column when this is null (unchanged behavior for all
-- existing badges).
-- ============================================================
alter table badges add column if not exists icon_url text;

create or replace function admin_upsert_badge(
  p_id uuid,
  p_family_code text,
  p_tier text,
  p_level text,
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
  v_valid_fields text[] := array[
    'move_me_weeks','sleep_me_weeks','eat_me_weeks','know_me_weeks',
    'buddy_walk_weeks','buddy_lunch_weeks','hydration_buddy_weeks','buddy_stretch_weeks',
    'big_step_weeks','zero_sugar_weeks','lunch_walk_weeks','gratitude_weeks',
    'all_complete_weeks','streak_weeks','total_steps','total_completions','distinct_types',
    'total_points','first_week_done','last_week_done'
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
    insert into badges (code, family_code, tier, level, name, description, icon, icon_url, condition_field, target_value)
    values (
      p_family_code || '_' || p_tier || '_' || extract(epoch from now())::bigint,
      p_family_code, p_tier, p_level::campaign_level, p_name, p_description, p_icon, p_icon_url, p_condition_field, p_target_value
    )
    returning id into v_new_id;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('created', true, 'name', p_name));
  else
    update badges set
      family_code = p_family_code, tier = p_tier, level = p_level::campaign_level,
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

-- ============================================================
-- 3. get_badge_progress() — pass through icon_url alongside icon
-- ============================================================
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
          'icon_url', b.icon_url,
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
