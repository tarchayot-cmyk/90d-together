-- ============================================================
-- PRE-TASK 1 — Auto Phase Lock
-- Phase is derived purely from campaigns.start_date vs current_date
-- — no scheduler/background job, no admin toggle needed. Correct
-- even if nobody logs in when the phase changes, since it's
-- computed fresh on every call.
-- ============================================================

-- ------------------------------------------------------------
-- 1. get_campaign_phase_info() — shared read-only helper. Open to
-- any authenticated member (not admin-only): members need it to
-- know which missions to show, admin needs it to see current
-- phase/day, and PRE-TASK 3's reminder will reuse it too.
-- ------------------------------------------------------------
create or replace function get_campaign_phase_info()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_current_day int;
  v_current_phase campaign_level;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is null then
    return jsonb_build_object('has_campaign', false);
  end if;

  v_current_day := (current_date - v_campaign.start_date + 1)::int;

  v_current_phase := case
    when v_current_day between 1 and 30 then 'me'::campaign_level
    when v_current_day between 31 and 60 then 'we'::campaign_level
    when v_current_day between 61 and 90 then 'us'::campaign_level
    else null
  end;

  return jsonb_build_object(
    'has_campaign', true,
    'campaign_id', v_campaign.id,
    'campaign_name', v_campaign.name,
    'current_day', v_current_day,
    'current_phase', v_current_phase,
    'start_date', v_campaign.start_date,
    'end_date', v_campaign.end_date
  );
end;
$$;

grant execute on function get_campaign_phase_info() to authenticated;

-- ------------------------------------------------------------
-- 2. complete_mission() — adds exactly one new guard (phase check)
-- right after the campaign-active check. Every other line —
-- duplicate check, target validation, proof/resubmit handling,
-- points, stickers, achievements, return shape — is unchanged from
-- the live 0018 version.
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
  v_current_phase campaign_level;
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

  -- NEW in PRE-TASK 1: a mission can only be checked into during its
  -- own phase's date window. Purely date-derived — no dependency on
  -- an admin having opened/closed anything.
  v_current_day := (current_date - v_campaign.start_date + 1)::int;
  v_current_phase := case
    when v_current_day between 1 and 30 then 'me'::campaign_level
    when v_current_day between 31 and 60 then 'we'::campaign_level
    when v_current_day between 61 and 90 then 'us'::campaign_level
    else null
  end;

  if v_mission.level is distinct from v_current_phase then
    raise exception 'mission_not_in_current_phase'
      using detail = format(
        'mission_level=%s, current_phase=%s, current_day=%s',
        v_mission.level, coalesce(v_current_phase::text, 'none'), v_current_day
      );
  end if;

  v_campaign_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select * into v_existing from check_ins
    where mission_id = p_mission_id and member_id = v_member_id and campaign_week = v_campaign_week;

  -- A row exists and it's NOT a rejected one: block, same as before.
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

grant execute on function complete_mission(uuid, numeric, text, text) to authenticated;
