-- ============================================================
-- PART 1 — schema: proof_url (text) -> proof_urls (text[], max 3)
-- ============================================================
alter table check_ins add column if not exists proof_urls text[];
update check_ins set proof_urls = array[proof_url] where proof_url is not null and proof_urls is null;
alter table check_ins drop column if exists proof_url;

-- ============================================================
-- PART 2 — complete_mission(): p_proof_url text -> p_proof_urls
-- text[] (up to 3). Parameter TYPE is changing, not just its
-- default, so CREATE OR REPLACE alone is rejected by Postgres —
-- confirmed necessary from the earlier "cannot remove parameter
-- defaults" error on a similar change. Drop first.
-- ============================================================
drop function if exists complete_mission(uuid, numeric, text, text);

create or replace function complete_mission(
  p_mission_id uuid,
  p_value numeric,
  p_note text default null,
  p_proof_urls text[] default null
) returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
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

  if p_proof_urls is not null and array_length(p_proof_urls, 1) > 3 then
    raise exception 'too_many_proof_images' using detail = 'max 3 images allowed';
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
      mission_id, member_id, campaign_week, value, note, proof_urls, proof_status, completed_at
    ) values (
      p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_urls, 'pending', null
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
    mission_id, member_id, campaign_week, value, note, proof_urls, proof_status, completed_at
  ) values (
    p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_urls, 'not_required', now()
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
$function$;

grant execute on function complete_mission(uuid, numeric, text, text[]) to authenticated;

-- ============================================================
-- PART 3 — admin_clear_proof_urls(): clear the array instead of
-- the old single column. Same signature (p_checkin_ids uuid[]),
-- no DROP needed.
-- ============================================================
create or replace function admin_clear_proof_urls(p_checkin_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_count int;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  update check_ins
    set proof_urls = null
    where id = any(p_checkin_ids)
      and proof_status in ('approved', 'rejected');

  get diagnostics v_count = row_count;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (
    v_admin_id, 'other', 'proof_cleanup', null,
    jsonb_build_object('cleared_count', v_count)
  );

  return jsonb_build_object('success', true, 'cleared_count', v_count);
end;
$$;
