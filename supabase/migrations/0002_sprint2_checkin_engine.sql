-- ============================================================
-- 90 Days Growing Together — Sprint 2 Migration
-- complete_mission() RPC + seed data (1 active campaign + 4 ME missions)
-- Depends on Sprint 1 (0001_sprint1_core.sql) — uses its tables,
-- enums, and the auth_member_id() helper already created there.
-- Run once, top to bottom, in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. complete_mission()
--
-- Deliberately strict / single-shot, matching this sprint's spec:
--   - one check-in per member per mission per campaign_week
--   - the submitted value must already meet target_value to count
--     (no partial-progress accumulation in this version)
--   - duplicate submissions and under-target submissions both
--     raise a real Postgres exception, so the Supabase client sees
--     it as an RPC error (`error.message`) rather than a silent
--     success:false payload.
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
  -- Resolve the caller from auth.uid() — never trust a client-passed member id.
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Mission must exist and be active.
  select * into v_mission from missions where id = p_mission_id and is_active = true;
  if v_mission.id is null then
    raise exception 'mission_not_found';
  end if;

  -- Its campaign must exist and be active.
  select * into v_campaign from campaigns where id = v_mission.campaign_id and is_active = true;
  if v_campaign.id is null then
    raise exception 'campaign_not_active';
  end if;

  -- campaign_week is derived server-side from campaigns.start_date —
  -- the client never supplies it, so it can't be spoofed.
  v_campaign_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  -- Duplicate guard: one check-in per mission per member per week.
  select exists (
    select 1 from check_ins
    where mission_id = p_mission_id
      and member_id = v_member_id
      and campaign_week = v_campaign_week
  ) into v_already_checked_in;

  if v_already_checked_in then
    raise exception 'already_checked_in_this_week'
      using detail = format('mission_id=%s, week=%s', p_mission_id, v_campaign_week);
  end if;

  -- Value must already meet the mission's target to record a completion.
  if p_value is null or p_value < v_mission.target_value then
    raise exception 'target_not_reached'
      using detail = format(
        'need %s %s, submitted %s',
        v_mission.target_value, v_mission.unit, coalesce(p_value, 0)
      );
  end if;

  -- Record the check-in.
  insert into check_ins (
    mission_id, member_id, campaign_week, value, note, proof_url,
    proof_status, completed_at
  ) values (
    p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_url,
    case when v_mission.requires_proof then 'pending' else 'not_required' end,
    now()
  )
  returning id into v_checkin_id;

  -- Points ledger entry.
  insert into points_transactions (member_id, points, source, source_ref_id)
  values (v_member_id, v_mission.points, 'mission', v_checkin_id);

  -- Sticker, if this mission awards one.
  if v_mission.sticker_color is not null and v_mission.sticker_amount > 0 then
    insert into stickers (member_id, color, amount, source, source_ref_id)
    values (v_member_id, v_mission.sticker_color, v_mission.sticker_amount, 'mission', v_checkin_id);

    v_sticker := jsonb_build_object(
      'color', v_mission.sticker_color,
      'amount', v_mission.sticker_amount
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'points', v_mission.points,
    'sticker', v_sticker,
    'message', 'Mission Complete!'
  );
end;
$$;

-- Client role only needs EXECUTE — table grants stay revoked
-- (see 0001_sprint1_core.sql), so this function is the only path in.
grant execute on function complete_mission(uuid, numeric, text, text) to authenticated;

-- ============================================================
-- 2. Seed data — one active 90-day campaign + the 4 ME missions
-- ============================================================
do $$
declare
  v_campaign_id uuid;
begin
  insert into campaigns (name, start_date, end_date, is_active)
  values (
    '90 Days Growing Together — Batch 1',
    current_date,
    current_date + interval '89 days',
    true
  )
  returning id into v_campaign_id;

  insert into missions (
    campaign_id, level, category, name, description,
    target_value, unit, points, sticker_color, sticker_amount, requires_proof
  ) values
    (v_campaign_id, 'me', 'know_me', 'Know Me',
     'ชั่งน้ำหนัก 1 ครั้ง/สัปดาห์', 1, 'times', 10, 'green', 1, false),

    (v_campaign_id, 'me', 'sleep_me', 'Sleep Me',
     'นอน ≥7 ชั่วโมง อย่างน้อย 4 วัน/สัปดาห์', 4, 'days', 10, 'pink', 1, false),

    (v_campaign_id, 'me', 'move_me', 'Move Me',
     'สะสม 50,000 steps/สัปดาห์', 50000, 'steps', 10, 'yellow', 1, false),

    (v_campaign_id, 'me', 'eat_me', 'Eat Me',
     'ทานสลัด หรือ ลดเครื่องดื่มรสหวาน อย่างน้อย 5 ครั้ง/สัปดาห์', 5, 'times', 10, 'red', 1, false);
end $$;
