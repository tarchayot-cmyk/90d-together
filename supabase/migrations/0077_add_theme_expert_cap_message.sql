-- When a member hits a theme's monthly points cap (see 0074/0075), show
-- a celebratory "Expert" message instead of a plain "cap reached" note:
-- congratulates them, invites them to help teammates keep going, and
-- tells them plainly they won't earn more points in that theme this
-- month but can still keep doing the activity. Shown both in the
-- check-in reward toast (complete_mission) and in the in-app
-- notification when an admin approves a proof-required check-in that
-- pushes them to/over the cap (admin_approve_checkin).
--
-- Adds theme_label() as a small shared helper so both functions (and
-- future ones) format theme names the same way.
--
-- Applied directly via Supabase MCP; this file just records the
-- migration in git.

create or replace function public.theme_label(p_theme text)
returns text
language sql
immutable
as $$
  select case p_theme
    when 'move' then 'กาย (Move)'
    when 'fuel' then 'กิน (Fuel)'
    when 'rest' then 'พัก (Rest)'
    when 'mind' then 'ใจ (Mind)'
    when 'connect' then 'สังคม (Connect)'
    else p_theme
  end;
$$;

create or replace function public.complete_mission(p_mission_id uuid, p_value numeric, p_note text default null, p_proof_urls text[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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
  v_campaign_month int;
  v_month_start date;
  v_month_end date;
  v_cap integer;
  v_points_this_month numeric;
  v_awarded_points integer;
  v_awarded_sticker_amount integer;
  v_capped boolean := false;
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

  select count(*) into v_week_count from check_ins
    where mission_id = p_mission_id and member_id = v_member_id
      and campaign_week = v_campaign_week and proof_status <> 'rejected';

  if v_week_count >= v_mission.max_per_week then
    raise exception 'weekly_limit_reached'
      using detail = format('mission_id=%s, week=%s, max_per_week=%s', p_mission_id, v_campaign_week, v_mission.max_per_week);
  end if;

  if v_mission.max_per_day is not null then
    select count(*) into v_day_count from check_ins
      where mission_id = p_mission_id and member_id = v_member_id
        and created_at::date = current_date and proof_status <> 'rejected';

    if v_day_count >= v_mission.max_per_day then
      raise exception 'daily_limit_reached'
        using detail = format('mission_id=%s, max_per_day=%s', p_mission_id, v_mission.max_per_day);
    end if;
  end if;

  if v_mission.input_type = 'text' then
    if p_note is null or length(trim(p_note)) = 0 then
      raise exception 'text_answer_required';
    end if;
  elsif p_value is null or p_value < v_mission.target_value then
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

  v_campaign_month := least(3, greatest(1, ceil(v_current_day::numeric / 30)::int));
  v_month_start := v_campaign.start_date + (v_campaign_month - 1) * 30;
  v_month_end := v_month_start + 29;

  select monthly_cap into v_cap
    from theme_monthly_caps
    where campaign_id = v_mission.campaign_id and theme = v_mission.theme;

  v_awarded_points := v_mission.points;
  v_awarded_sticker_amount := v_mission.sticker_amount;

  if v_cap is not null then
    select coalesce(sum(pt.points), 0) into v_points_this_month
      from points_transactions pt
      join check_ins ci on ci.id = pt.source_ref_id
      join missions m on m.id = ci.mission_id
      where pt.member_id = v_member_id
        and pt.source = 'mission'
        and m.theme = v_mission.theme
        and pt.created_at::date between v_month_start and v_month_end;

    if v_points_this_month >= v_cap then
      v_awarded_points := 0;
      v_awarded_sticker_amount := 0;
      v_capped := true;
    elsif v_points_this_month + v_mission.points > v_cap then
      v_awarded_points := v_cap - v_points_this_month;
      v_awarded_sticker_amount := 0;
      v_capped := true;
    end if;
  end if;

  insert into check_ins (
    mission_id, member_id, campaign_week, value, note, proof_urls, proof_status, completed_at
  ) values (
    p_mission_id, v_member_id, v_campaign_week, p_value, p_note, p_proof_urls, 'not_required', now()
  )
  returning id into v_checkin_id;

  if v_awarded_points > 0 then
    insert into points_transactions (member_id, points, source, source_ref_id)
    values (v_member_id, v_awarded_points, 'mission', v_checkin_id);
  end if;

  if v_mission.sticker_color is not null and v_awarded_sticker_amount > 0 then
    insert into stickers (member_id, color, amount, source, source_ref_id)
    values (v_member_id, v_mission.sticker_color, v_awarded_sticker_amount, 'mission', v_checkin_id);

    v_sticker := jsonb_build_object('color', v_mission.sticker_color, 'amount', v_awarded_sticker_amount);
  end if;

  perform check_achievements(v_member_id);

  return jsonb_build_object(
    'success', true,
    'pending_review', false,
    'points', v_awarded_points,
    'sticker', v_sticker,
    'capped', v_capped,
    'message', case when v_capped then
      '🎉 ยินดีด้วย! คุณเป็น Expert ด้าน' || theme_label(v_mission.theme) || ' ของเดือนนี้แล้ว! ลองชวนเพื่อนร่วมงานมาทำกิจกรรมนี้ด้วยกันดูนะ 💪 คุณจะไม่ได้คะแนนเพิ่มใน theme นี้ในเดือนนี้แล้ว แต่ยังทำกิจกรรมต่อได้เรื่อยๆ นะ'
    else 'Mission Complete!' end
  );
end;
$function$;

create or replace function public.admin_approve_checkin(p_checkin_id uuid, p_approved boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_id uuid;
  v_checkin check_ins%rowtype;
  v_mission missions%rowtype;
  v_campaign campaigns%rowtype;
  v_new_status text;
  v_current_day int;
  v_campaign_month int;
  v_month_start date;
  v_month_end date;
  v_cap integer;
  v_points_this_month numeric;
  v_awarded_points integer;
  v_awarded_sticker_amount integer;
  v_capped boolean := false;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_admin_id := auth_member_id();

  select * into v_checkin from check_ins where id = p_checkin_id;
  if v_checkin.id is null then
    raise exception 'checkin_not_found';
  end if;

  if v_checkin.member_id = v_admin_id then
    raise exception 'cannot_approve_own_submission';
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

    update check_ins set
      proof_status = v_new_status,
      completed_at = now(),
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      rejection_reason = null
    where id = p_checkin_id;

    select * into v_campaign from campaigns where id = v_mission.campaign_id;
    v_current_day := (current_date - v_campaign.start_date + 1)::int;
    v_campaign_month := least(3, greatest(1, ceil(v_current_day::numeric / 30)::int));
    v_month_start := v_campaign.start_date + (v_campaign_month - 1) * 30;
    v_month_end := v_month_start + 29;

    select monthly_cap into v_cap
      from theme_monthly_caps
      where campaign_id = v_mission.campaign_id and theme = v_mission.theme;

    v_awarded_points := v_mission.points;
    v_awarded_sticker_amount := v_mission.sticker_amount;

    if v_cap is not null then
      select coalesce(sum(pt.points), 0) into v_points_this_month
        from points_transactions pt
        join check_ins ci on ci.id = pt.source_ref_id
        join missions m on m.id = ci.mission_id
        where pt.member_id = v_checkin.member_id
          and pt.source = 'mission'
          and m.theme = v_mission.theme
          and pt.created_at::date between v_month_start and v_month_end;

      if v_points_this_month >= v_cap then
        v_awarded_points := 0;
        v_awarded_sticker_amount := 0;
        v_capped := true;
      elsif v_points_this_month + v_mission.points > v_cap then
        v_awarded_points := v_cap - v_points_this_month;
        v_awarded_sticker_amount := 0;
        v_capped := true;
      end if;
    end if;

    if v_awarded_points > 0 then
      insert into points_transactions (member_id, points, source, source_ref_id)
      values (v_checkin.member_id, v_awarded_points, 'mission', v_checkin.id);
    end if;

    if v_mission.sticker_color is not null and v_awarded_sticker_amount > 0 then
      insert into stickers (member_id, color, amount, source, source_ref_id)
      values (v_checkin.member_id, v_mission.sticker_color, v_awarded_sticker_amount, 'mission', v_checkin.id);
    end if;

    perform check_achievements(v_checkin.member_id);

    begin
      perform create_notification(
        v_checkin.member_id,
        'checkin_approved',
        case when v_capped then
          'ภารกิจ "' || v_mission.name || '" ได้รับการอนุมัติแล้ว 🎉 ยินดีด้วย! คุณเป็น Expert ด้าน' || theme_label(v_mission.theme) || ' ของเดือนนี้แล้ว! ลองชวนเพื่อนร่วมงานมาทำกิจกรรมนี้ด้วยกันดูนะ 💪 คุณจะไม่ได้คะแนนเพิ่มใน theme นี้ในเดือนนี้แล้ว แต่ยังทำกิจกรรมต่อได้เรื่อยๆ นะ'
        else
          'ภารกิจ "' || v_mission.name || '" ของคุณได้รับการอนุมัติแล้ว ได้รับ +' || v_awarded_points || ' คะแนน 🎉'
        end,
        '/missions',
        jsonb_build_object('check_in_id', p_checkin_id, 'mission_id', v_mission.id)
      );
    exception when others then
      null;
    end;
  else
    v_new_status := 'rejected';
    update check_ins set
      proof_status = v_new_status,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      rejection_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_checkin_id;

    begin
      perform create_notification(
        v_checkin.member_id,
        'checkin_rejected',
        'ภารกิจ "' || v_mission.name || '" ของคุณไม่ผ่านการตรวจสอบหลักฐาน'
          || case when p_reason is not null and trim(p_reason) <> '' then ' เหตุผล: ' || trim(p_reason) else '' end
          || ' — ลองส่งใหม่อีกครั้งได้เลย',
        '/missions',
        jsonb_build_object('check_in_id', p_checkin_id, 'mission_id', v_mission.id)
      );
    exception when others then
      null;
    end;
  end if;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id,
    (case when p_approved then 'approve_checkin' else 'reject_checkin' end)::audit_action,
    'check_in', p_checkin_id,
    jsonb_build_object('proof_status', 'pending'),
    jsonb_build_object('proof_status', v_new_status, 'reason', p_reason)
  );

  return jsonb_build_object('success', true, 'status', v_new_status);
end;
$function$;
