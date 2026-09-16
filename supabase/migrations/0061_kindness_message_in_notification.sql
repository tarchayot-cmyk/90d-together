-- Same signature as before (p_to_member_id uuid, p_category kindness_category,
-- p_message text default null) — no DROP needed. Only change: the
-- notification text now includes the category label and the
-- sender's message (if they wrote one), instead of a generic line.
-- Sender identity is still never revealed to the recipient.
create or replace function give_kindness(
  p_to_member_id uuid,
  p_category kindness_category,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_member_id uuid;
  v_campaign campaigns%rowtype;
  v_week int;
  v_pair_count int;
  v_recipient_count int;
  v_kindness_id uuid;
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

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    raise exception 'campaign_not_active';
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select count(*) into v_pair_count from kindness_logs
    where from_member_id = v_from_member_id and to_member_id = p_to_member_id and campaign_week = v_week;
  if v_pair_count >= 1 then
    raise exception 'pair_limit_reached';
  end if;

  select count(*) into v_recipient_count from kindness_logs
    where to_member_id = p_to_member_id and campaign_week = v_week;
  if v_recipient_count >= 3 then
    raise exception 'recipient_limit_reached';
  end if;

  -- the pre-check above still runs first (fast path, good error
  -- message in the common case) — this catches the rare race where
  -- two requests both passed it before either committed.
  begin
    insert into kindness_logs (campaign_id, from_member_id, to_member_id, category, message, campaign_week)
    values (v_campaign.id, v_from_member_id, p_to_member_id, p_category, p_message, v_week)
    returning id into v_kindness_id;
  exception when unique_violation then
    raise exception 'pair_limit_reached';
  end;

  insert into points_transactions (member_id, points, source, source_ref_id)
  values (p_to_member_id, 10, 'kindness', v_kindness_id);

  insert into stickers (member_id, color, amount, source, source_ref_id)
  values (p_to_member_id, 'rainbow', 1, 'kindness', v_kindness_id);

  perform check_achievements(p_to_member_id);

  v_category_label := case p_category
    when 'help' then '❤️ ช่วยงาน'
    when 'walk_invite' then '🚶 ชวนเดิน'
    when 'compliment' then '💬 ชื่นชม'
    when 'encourage' then '🤝 ให้กำลังใจ'
    when 'healthy_food_invite' then '🥗 ชวนกินดี'
    when 'rest_stretch_invite' then '🧘 ชวนพัก/ยืดเหยียด'
    else '🌈 Kindness'
  end;

  v_notification_message := 'คุณได้รับความห่วงใย (Kindness): ' || v_category_label
    || case when p_message is not null and trim(p_message) <> '' then ' — "' || trim(p_message) || '"' else '' end;

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

  return jsonb_build_object('success', true, 'message', 'ส่งความห่วงใยสำเร็จ!');
end;
$$;
