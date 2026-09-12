-- ============================================================
-- Mission availability window change (confirmed with user):
-- - ME: checkable the entire 90-day campaign (not just days 1-30)
-- - WE: checkable only days 31-60
-- - US: checkable only days 61-90
--
-- This replaces the PRE-TASK 1 model of "exactly one exclusive
-- phase active at a time" with "ME is always open, WE/US open only
-- in their own month". get_campaign_phase_info() now returns
-- unlocked_levels (array) instead of a single current_phase, plus
-- primary_phase for the Home Hero card (confirmed: Hero shows only
-- the month's headline phase — US in month 3, not ME+US together).
-- ============================================================

create or replace function get_campaign_phase_info()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_current_day int;
  v_primary_phase campaign_level;
  v_unlocked jsonb;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is null then
    return jsonb_build_object('has_campaign', false);
  end if;

  v_current_day := (current_date - v_campaign.start_date + 1)::int;

  v_primary_phase := case
    when v_current_day between 1 and 30 then 'me'::campaign_level
    when v_current_day between 31 and 60 then 'we'::campaign_level
    when v_current_day between 61 and 90 then 'us'::campaign_level
    else null
  end;

  v_unlocked := (
    select coalesce(jsonb_agg(lvl), '[]'::jsonb) from (
      select 'me' as lvl where v_current_day between 1 and 90
      union all
      select 'we' where v_current_day between 31 and 60
      union all
      select 'us' where v_current_day between 61 and 90
    ) t
  );

  return jsonb_build_object(
    'has_campaign', true,
    'campaign_id', v_campaign.id,
    'campaign_name', v_campaign.name,
    'current_day', v_current_day,
    'primary_phase', v_primary_phase,
    'unlocked_levels', v_unlocked,
    'start_date', v_campaign.start_date,
    'end_date', v_campaign.end_date
  );
end;
$$;

-- ------------------------------------------------------------
-- complete_mission() — same guard position as PRE-TASK 1, just the
-- unlock rule changed from "level must equal the single current
-- phase" to "level must be in its own allowed day window". Every
-- other line is unchanged.
-- ------------------------------------------------------------
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
  v_existing check_ins%rowtype;
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

  select * into v_existing from check_ins
    where mission_id = p_mission_id and member_id = v_member_id and campaign_week = v_campaign_week;

  if v_existing.id is not null and v_existing.proof_status <> 'rejected' then
    raise exception 'already_checked_in_this_week'
      using detail = format('mission_id=%s, week=%s', p_mission_id, v_campaign_week);
  end if;

  if p_value is null or p_value < v_mission.target_value then
    raise exception 'target_not_reached'
      using detail = format(
        'need %s %s, submitted %s', v_mission.target_value, v_mission.unit, coalesce(p_value, 0)
      );
  end if;

  if v_mission.requires_proof then
    if v_existing.id is not null then
      update check_ins
        set value = p_value, note = p_note, proof_url = p_proof_url,
            proof_status = 'pending', completed_at = null, updated_at = now()
        where id = v_existing.id;
    else
      insert into check_ins (
        mission_id, member_id, campaign_week, value, note, proof_url, proof_status, completed_at
      ) values (
        p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_url, 'pending', null
      );
    end if;

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

-- ------------------------------------------------------------
-- get_admin_reminders() — switch from checking a single
-- current_phase to checking the day directly, since there's no
-- longer one exclusive "current phase" concept.
-- ------------------------------------------------------------
create or replace function get_admin_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_current_day int;
  v_has_buddy_groups boolean := false;
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

  select exists (select 1 from buddy_groups where campaign_id = v_campaign.id) into v_has_buddy_groups;
  select exists (select 1 from squads where campaign_id = v_campaign.id) into v_has_squads;

  return jsonb_build_object(
    'needs_buddy_assignment', (v_current_day >= 31 and not v_has_buddy_groups),
    'needs_squad_assignment', (v_current_day >= 61 and not v_has_squads)
  );
end;
$$;
