-- ============================================================
-- Bug fix: complete_mission() blocked resubmission forever after
-- an admin rejected a proof-required check-in, because the
-- "already checked in this week" guard only checked for row
-- EXISTENCE, not its proof_status. A rejected check-in should let
-- the member try again — that's the whole point of rejecting it.
--
-- Fix: when the existing row for this mission/member/week has
-- proof_status = 'rejected', UPDATE that row in place (reset value/
-- note/proof/status to 'pending') instead of raising the duplicate
-- error. This respects the check_ins unique constraint (mission_id,
-- member_id, campaign_week) — we can't insert a second row for the
-- same week, so a rejected resubmission has to reuse the same row.
--
-- Everything else in complete_mission() is unchanged: the
-- non-proof-required path, the target-value check, and the normal
-- first-time-submission path all behave exactly as before.
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
    -- NEW: resubmission after rejection reuses the same row instead
    -- of inserting a new one (unique constraint would block a
    -- second insert for this mission/member/week anyway).
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

  -- No proof required: unchanged from before.
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
