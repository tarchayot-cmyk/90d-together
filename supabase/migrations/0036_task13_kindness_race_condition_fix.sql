-- ============================================================
-- TASK 13 — Score Audit
-- Finding: check_ins has UNIQUE(mission_id, member_id, campaign_week)
-- and activity_votes has UNIQUE(proposal_id, member_id) — both make
-- duplicate scoring impossible even under a race condition (two
-- near-simultaneous requests), because the database itself rejects
-- the second INSERT. kindness_logs had NO equivalent constraint —
-- its "1 kindness per pair per week" limit was enforced purely by a
-- SELECT-count-then-INSERT check in give_kindness(), which two
-- concurrent requests could both pass before either commits,
-- resulting in double points for the same pair/week.
--
-- Fix: add the missing unique constraint (matches the business rule
-- exactly), and make give_kindness() handle the resulting
-- unique_violation the same way it already handles the pre-check —
-- so behavior is identical to the caller whether the race was closed
-- by the early check or by this new safety net.
--
-- Note: the OTHER anti-abuse rule ("recipient max 3 kindness/week
-- from anyone") is a count across multiple different senders, not a
-- simple key uniqueness — it can't be closed with a UNIQUE
-- constraint the same way. Left as-is (documented, not silently
-- ignored): a genuine 3-way simultaneous race could let a recipient
-- receive 4 instead of 3 in one week. Bounded, low-impact, and would
-- need a trigger/advisory-lock to fully close — out of scope for a
-- targeted audit fix per "avoid large migrations if unnecessary".
-- ============================================================

alter table kindness_logs
  add constraint kindness_logs_pair_week_unique unique (from_member_id, to_member_id, campaign_week);

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

  -- NEW: the pre-check above still runs first (fast path, good error
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

  begin
    perform create_notification(
      p_to_member_id,
      'kindness_received',
      'คุณได้รับความห่วงใย (Kindness) จากเพื่อนร่วมงาน 🌈',
      '/home',
      null
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true, 'message', 'ส่งความห่วงใยสำเร็จ!');
end;
$$;

grant execute on function give_kindness(uuid, kindness_category, text) to authenticated;
