-- ============================================================
-- Kindness system redesign (confirmed with user):
-- - Sender: up to 10 sends per DAY (the old "1 per pair per week"
--   limit is removed entirely — same pair can be sent to repeatedly)
-- - Receiver: can receive unlimited kindness, but only the first 3
--   per week actually award points/sticker (same 3/week rule as
--   before, just now it's a soft cap instead of a hard block)
-- - Message is now required (was optional)
-- ============================================================

-- The old pair-per-week uniqueness no longer applies — same pair
-- can send/receive repeatedly now.
alter table kindness_logs drop constraint if exists kindness_logs_pair_week_unique;

-- Same signature as before (p_to_member_id uuid, p_category
-- kindness_category, p_message text) — dropping the `default null`
-- on p_message doesn't change arity/types, so no DROP needed.
create or replace function give_kindness(
  p_to_member_id uuid,
  p_category kindness_category,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_member_id uuid;
  v_campaign campaigns%rowtype;
  v_week int;
  v_sent_today int;
  v_received_this_week int;
  v_kindness_id uuid;
  v_awarded_points boolean;
  v_category_label text;
  v_notification_message text;
begin
  v_from_member_id := auth_member_id();
  if v_from_member_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_to_member_id = v_from_member_id then
    raise exception 'cannot_send_to_self';
  end if;

  if p_message is null or trim(p_message) = '' then
    raise exception 'message_required';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    raise exception 'campaign_not_active';
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  -- Sender limit: 10 sends per day, regardless of recipient.
  select count(*) into v_sent_today from kindness_logs
    where from_member_id = v_from_member_id and created_at::date = current_date;
  if v_sent_today >= 10 then
    raise exception 'daily_send_limit_reached';
  end if;

  insert into kindness_logs (campaign_id, from_member_id, to_member_id, category, message, campaign_week)
  values (v_campaign.id, v_from_member_id, p_to_member_id, p_category, trim(p_message), v_week)
  returning id into v_kindness_id;

  -- Receiver keeps receiving kindness beyond 3/week (logged either
  -- way), but only the first 3 that week actually award points —
  -- count BEFORE this row (that's why this row itself isn't counted
  -- in v_received_this_week).
  select count(*) into v_received_this_week from kindness_logs
    where to_member_id = p_to_member_id and campaign_week = v_week and id <> v_kindness_id;

  v_awarded_points := v_received_this_week < 3;

  if v_awarded_points then
    insert into points_transactions (member_id, points, source, source_ref_id)
    values (p_to_member_id, 10, 'kindness', v_kindness_id);

    insert into stickers (member_id, color, amount, source, source_ref_id)
    values (p_to_member_id, 'rainbow', 1, 'kindness', v_kindness_id);

    perform check_achievements(p_to_member_id);
  end if;

  v_category_label := case p_category
    when 'help' then '❤️ ช่วยงาน'
    when 'walk_invite' then '🚶 ชวนเดิน'
    when 'compliment' then '💬 ชื่นชม'
    when 'encourage' then '🤝 ให้กำลังใจ'
    when 'healthy_food_invite' then '🥗 ชวนกินดี'
    when 'rest_stretch_invite' then '🧘 ชวนพัก/ยืดเหยียด'
    when 'other' then '✨ อื่นๆ'
    else '🌈 Kindness'
  end;

  v_notification_message := 'คุณได้รับความห่วงใย (Kindness): ' || v_category_label
    || ' — "' || trim(p_message) || '"'
    || case when not v_awarded_points then ' (เกินโควตาคะแนนสัปดาห์นี้แล้ว แต่ยังได้รับกำลังใจอยู่นะ)' else '' end;

  begin
    perform create_notification(
      p_to_member_id,
      'kindness_received',
      v_notification_message,
      '/home',
      null
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'success', true,
    'message', 'ส่งความห่วงใยสำเร็จ!',
    'awarded_points', v_awarded_points,
    'remaining_today', greatest(0, 9 - v_sent_today)
  );
end;
$$;

grant execute on function give_kindness(uuid, kindness_category, text) to authenticated;

-- ------------------------------------------------------------
-- New: how many sends the caller has left today, for the send-
-- kindness screen to show up front (before they even try to send).
-- ------------------------------------------------------------
create or replace function get_kindness_sender_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_sent_today int;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select count(*) into v_sent_today from kindness_logs
    where from_member_id = v_member_id and created_at::date = current_date;

  return jsonb_build_object('sent_today', v_sent_today, 'remaining_today', greatest(0, 10 - v_sent_today));
end;
$$;

grant execute on function get_kindness_sender_status() to authenticated;
