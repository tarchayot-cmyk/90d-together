-- ============================================================
-- Configurable check-in frequency: missions can now allow more than
-- 1 completion per week (e.g. "drink water" a few times a day), and
-- optionally cap completions per day too.
--
-- Default max_per_week=1 for every existing mission preserves
-- current behavior EXACTLY — nothing changes for missions the admin
-- doesn't explicitly reconfigure. max_per_day is nullable (no daily
-- cap) by default.
--
-- The old UNIQUE(mission_id, member_id, campaign_week) constraint
-- physically prevented more than one row per week for ANY mission —
-- it has to be dropped to allow max_per_week > 1. The new logic
-- (below) replaces it with a count-based check inside
-- complete_mission() that reproduces the exact old behavior when
-- max_per_week=1.
-- ============================================================
alter table missions add column if not exists max_per_week int not null default 1 check (max_per_week > 0);
alter table missions add column if not exists max_per_day int check (max_per_day is null or max_per_day > 0);

alter table check_ins drop constraint if exists check_ins_mission_id_member_id_campaign_week_key;

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
  v_current_day int;
  v_level_unlocked boolean;
  v_week_count int;
  v_day_count int;
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

  v_current_day := (current_date - v_campaign.start_date + 1)::int;

  v_level_unlocked := case
    when v_current_day < 1 or v_current_day > 90 then false
    when v_mission.level = 'me' then true
    when v_mission.level = 'we' then v_current_day between 31 and 60
    when v_mission.level = 'us' then v_current_day between 61 and 90
    else false
  end;

  if not v_level_unlocked then
    raise exception 'mission_not_in_current_phase'
      using detail = format('mission_level=%s, current_day=%s', v_mission.level, v_current_day);
  end if;

  v_campaign_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  -- Weekly limit: count non-rejected check-ins this week. A rejected
  -- submission never counts against the limit — this is also what
  -- makes "resubmit after rejection" keep working with no special
  -- case needed anymore.
  select count(*) into v_week_count from check_ins
    where mission_id = p_mission_id and member_id = v_member_id
      and campaign_week = v_campaign_week and proof_status <> 'rejected';

  if v_week_count >= v_mission.max_per_week then
    raise exception 'weekly_limit_reached'
      using detail = format('mission_id=%s, week=%s, max_per_week=%s', p_mission_id, v_campaign_week, v_mission.max_per_week);
  end if;

  -- Daily limit (optional).
  if v_mission.max_per_day is not null then
    select count(*) into v_day_count from check_ins
      where mission_id = p_mission_id and member_id = v_member_id
        and created_at::date = current_date and proof_status <> 'rejected';

    if v_day_count >= v_mission.max_per_day then
      raise exception 'daily_limit_reached'
        using detail = format('mission_id=%s, max_per_day=%s', p_mission_id, v_mission.max_per_day);
    end if;
  end if;

  if p_value is null or p_value < v_mission.target_value then
    raise exception 'target_not_reached'
      using detail = format(
        'need %s %s, submitted %s', v_mission.target_value, v_mission.unit, coalesce(p_value, 0)
      );
  end if;

  if v_mission.requires_proof then
    insert into check_ins (
      mission_id, member_id, campaign_week, value, note, proof_url, proof_status, completed_at
    ) values (
      p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_url, 'pending', null
    );

    return jsonb_build_object(
      'success', true,
      'pending_review', true,
      'points', 0,
      'sticker', null,
      'message', 'ส่งหลักฐานเรียบร้อย รอ Admin ตรวจสอบ'
    );
  end if;

  insert into check_ins (
    mission_id, member_id, campaign_week, value, note, proof_url, proof_status, completed_at
  ) values (
    p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_url, 'not_required', now()
  )
  returning id into v_checkin_id;

  insert into points_transactions (member_id, points, source, source_ref_id)
  values (v_member_id, v_mission.points, 'mission', v_checkin_id);

  if v_mission.sticker_color is not null and v_mission.sticker_amount > 0 then
    insert into stickers (member_id, color, amount, source, source_ref_id)
    values (v_member_id, v_mission.sticker_color, v_mission.sticker_amount, 'mission', v_checkin_id);

    v_sticker := jsonb_build_object('color', v_mission.sticker_color, 'amount', v_mission.sticker_amount);
  end if;

  perform check_achievements(v_member_id);

  return jsonb_build_object(
    'success', true,
    'pending_review', false,
    'points', v_mission.points,
    'sticker', v_sticker,
    'message', 'Mission Complete!'
  );
end;
$$;

grant execute on function complete_mission(uuid, numeric, text, text) to authenticated;

-- ------------------------------------------------------------
-- admin_upsert_mission() — add p_max_per_week/p_max_per_day.
-- Signature changes from 14 params (0047) to 16, so the old version
-- must be dropped first.
-- ------------------------------------------------------------
drop function if exists admin_upsert_mission(uuid, uuid, campaign_level, mission_category, text, text, numeric, text, int, sticker_color, int, boolean, boolean, text);

create or replace function admin_upsert_mission(
  p_mission_id uuid,
  p_campaign_id uuid,
  p_level campaign_level,
  p_category mission_category,
  p_name text,
  p_description text,
  p_target_value numeric,
  p_unit text,
  p_points int,
  p_sticker_color sticker_color,
  p_sticker_amount int,
  p_requires_proof boolean,
  p_is_active boolean,
  p_input_type text default 'numeric',
  p_max_per_week int default 1,
  p_max_per_day int default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_value jsonb;
  v_new_mission missions%rowtype;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_target_value <= 0 then
    raise exception 'target_value_must_be_positive';
  end if;
  if p_input_type not in ('numeric', 'checkbox') then
    raise exception 'invalid_input_type';
  end if;
  if p_max_per_week <= 0 then
    raise exception 'max_per_week_must_be_positive';
  end if;
  if p_max_per_day is not null and p_max_per_day <= 0 then
    raise exception 'max_per_day_must_be_positive';
  end if;

  if p_mission_id is null then
    insert into missions (
      campaign_id, level, category, name, description, target_value, unit,
      points, sticker_color, sticker_amount, requires_proof, is_active, input_type,
      max_per_week, max_per_day
    ) values (
      p_campaign_id, p_level, p_category, p_name, p_description, p_target_value, p_unit,
      p_points, p_sticker_color, p_sticker_amount, p_requires_proof, p_is_active, p_input_type,
      p_max_per_week, p_max_per_day
    )
    returning * into v_new_mission;

    insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
    values (v_admin_id, 'edit_mission', 'mission', v_new_mission.id, null, to_jsonb(v_new_mission));
  else
    select to_jsonb(m) into v_old_value from missions m where m.id = p_mission_id;
    if v_old_value is null then
      raise exception 'mission_not_found';
    end if;

    update missions set
      campaign_id = p_campaign_id, level = p_level, category = p_category,
      name = p_name, description = p_description, target_value = p_target_value, unit = p_unit,
      points = p_points, sticker_color = p_sticker_color, sticker_amount = p_sticker_amount,
      requires_proof = p_requires_proof, is_active = p_is_active, input_type = p_input_type,
      max_per_week = p_max_per_week, max_per_day = p_max_per_day
    where id = p_mission_id
    returning * into v_new_mission;

    insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
    values (v_admin_id, 'edit_mission', 'mission', p_mission_id, v_old_value, to_jsonb(v_new_mission));
  end if;

  return jsonb_build_object('success', true, 'mission_id', v_new_mission.id);
end;
$$;

grant execute on function admin_upsert_mission(uuid, uuid, campaign_level, mission_category, text, text, numeric, text, int, sticker_color, int, boolean, boolean, text, int, int) to authenticated;
