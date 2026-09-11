-- ============================================================
-- 90 Days Growing Together — Sprint 5 Migration
-- Admin Dashboard, Review & Audit (spec sections 24-30)
-- Depends on Sprints 1-4.
-- Run once, top to bottom, in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. admin_get_overview()  — spec section 24
-- Every branch is gated by is_admin() up front; there is no
-- partial-data path for a non-admin caller.
-- ============================================================
create or replace function admin_get_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_week int;
  v_total_participants int;
  v_active_today int;
  v_checkin_rate numeric := 0;
  v_kindness_total int;
  v_growth_points_total numeric;
  v_avg_me numeric := 0;
  v_avg_we numeric := 0;
  v_avg_us numeric := 0;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  select count(*) into v_total_participants
    from members where role = 'participant' and is_active = true;

  select count(distinct member_id) into v_active_today
    from check_ins where created_at::date = current_date;

  select count(*) into v_kindness_total
    from kindness_logs
    where v_campaign.id is not null and campaign_id = v_campaign.id;

  select coalesce(sum(points), 0) into v_growth_points_total from points_transactions;

  if v_campaign.id is not null then
    v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

    select coalesce(
      count(distinct member_id)::numeric / nullif(v_total_participants, 0), 0
    ) into v_checkin_rate
    from check_ins
    where campaign_week = v_week and completed_at is not null;

    -- Average ME/WE/US progress across all participants (same
    -- "distinct completed weeks / 5" approximation as get_tree_progress()).
    select
      avg(least(1.0, me_weeks / 5.0)),
      avg(least(1.0, we_weeks / 5.0)),
      avg(least(1.0, us_weeks / 5.0))
    into v_avg_me, v_avg_we, v_avg_us
    from (
      select
        p.id,
        count(distinct ci.campaign_week) filter (where m.level = 'me' and ci.completed_at is not null) as me_weeks,
        count(distinct ci.campaign_week) filter (where m.level = 'we' and ci.completed_at is not null) as we_weeks,
        count(distinct ci.campaign_week) filter (where m.level = 'us' and ci.completed_at is not null) as us_weeks
      from members p
      left join check_ins ci on ci.member_id = p.id
      left join missions m on m.id = ci.mission_id
      where p.role = 'participant' and p.is_active = true
      group by p.id
    ) per_member;
  end if;

  return jsonb_build_object(
    'campaign_name', v_campaign.name,
    'participants', v_total_participants,
    'active_today', v_active_today,
    'checkin_rate', round(coalesce(v_checkin_rate, 0) * 100, 1),
    'kindness_total', v_kindness_total,
    'growth_points_total', v_growth_points_total,
    'avg_me', round(coalesce(v_avg_me, 0) * 100, 1),
    'avg_we', round(coalesce(v_avg_we, 0) * 100, 1),
    'avg_us', round(coalesce(v_avg_us, 0) * 100, 1)
  );
end;
$$;

grant execute on function admin_get_overview() to authenticated;

-- ============================================================
-- 2. admin_adjust_points()  — spec sections 28-29, always audited
-- ============================================================
create or replace function admin_adjust_points(
  p_member_id uuid,
  p_points int,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_total numeric;
  v_new_total numeric;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_admin_id := auth_member_id();

  if not exists (select 1 from members where id = p_member_id) then
    raise exception 'member_not_found';
  end if;

  select coalesce(sum(points), 0) into v_old_total
    from points_transactions where member_id = p_member_id;

  insert into points_transactions (member_id, points, source, source_ref_id)
  values (p_member_id, p_points, 'admin_adjust', null);

  v_new_total := v_old_total + p_points;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id, 'adjust_points', 'member', p_member_id,
    jsonb_build_object('points_total', v_old_total),
    jsonb_build_object('points_total', v_new_total, 'delta', p_points, 'reason', p_reason)
  );

  return jsonb_build_object('success', true, 'old_total', v_old_total, 'new_total', v_new_total);
end;
$$;

grant execute on function admin_adjust_points(uuid, int, text) to authenticated;

-- ============================================================
-- 3. admin_approve_checkin()  — spec section 27, always audited
--
-- Behavior change from earlier sprints: proof-required missions now
-- hold their reward until an admin approves (see the updated
-- complete_mission() below) — this function is what actually grants
-- the points/sticker once approved, or leaves it un-rewarded if
-- rejected. A check-in can only be reviewed once (proof_status must
-- currently be 'pending') so a reward can never be granted twice.
-- ============================================================
create or replace function admin_approve_checkin(
  p_checkin_id uuid,
  p_approved boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_checkin check_ins%rowtype;
  v_mission missions%rowtype;
  v_new_status text;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_admin_id := auth_member_id();

  select * into v_checkin from check_ins where id = p_checkin_id;
  if v_checkin.id is null then
    raise exception 'checkin_not_found';
  end if;

  select * into v_mission from missions where id = v_checkin.mission_id;

  if not v_mission.requires_proof then
    raise exception 'proof_not_required';
  end if;

  if v_checkin.proof_status <> 'pending' then
    raise exception 'already_reviewed';
  end if;

  if p_approved then
    v_new_status := 'approved';

    update check_ins set proof_status = v_new_status, completed_at = now() where id = p_checkin_id;

    insert into points_transactions (member_id, points, source, source_ref_id)
    values (v_checkin.member_id, v_mission.points, 'mission', v_checkin.id);

    if v_mission.sticker_color is not null and v_mission.sticker_amount > 0 then
      insert into stickers (member_id, color, amount, source, source_ref_id)
      values (v_checkin.member_id, v_mission.sticker_color, v_mission.sticker_amount, 'mission', v_checkin.id);
    end if;

    perform check_achievements(v_checkin.member_id);
  else
    v_new_status := 'rejected';
    update check_ins set proof_status = v_new_status where id = p_checkin_id;
    -- No points/sticker: the reward was never granted for this
    -- check-in in the first place (see complete_mission() below).
  end if;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id,
    case when p_approved then 'approve_checkin' else 'reject_checkin' end,
    'check_in', p_checkin_id,
    jsonb_build_object('proof_status', 'pending'),
    jsonb_build_object('proof_status', v_new_status)
  );

  return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;

grant execute on function admin_approve_checkin(uuid, boolean) to authenticated;

-- ============================================================
-- 4. Proof-gating fix to complete_mission()
--
-- Sprints 2-4 granted the reward immediately on submission even for
-- requires_proof missions, which made admin_approve_checkin() above
-- pointless (there'd be nothing left to grant). This re-declaration
-- holds points/sticker/achievement-check back until an admin approves
-- via the function above, for requires_proof = true missions only.
-- Non-proof missions are completely unchanged from Sprint 4.
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

  if v_mission.requires_proof then
    -- Hold the reward: record the submission as pending review, no
    -- points/sticker/achievement-check until admin_approve_checkin().
    insert into check_ins (
      mission_id, member_id, campaign_week, value, note, proof_url, proof_status, completed_at
    ) values (
      p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_url, 'pending', null
    )
    returning id into v_checkin_id;

    return jsonb_build_object(
      'success', true,
      'pending_review', true,
      'points', 0,
      'sticker', null,
      'message', 'ส่งหลักฐานเรียบร้อย รอ Admin ตรวจสอบ'
    );
  end if;

  -- No proof required: reward immediately, same as Sprint 4.
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
