-- ============================================================
-- TASK 1 — Notification system
-- Additive only: new table + 2 new RPCs, plus a minimal hook (one
-- `perform`, exception-guarded) added to the END of two existing
-- functions. No existing logic, column, or return shape is changed.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Enum — all 6 spec'd types declared now (avoids a future
-- ALTER TYPE in Task 2), but only the first 2 are actually fired
-- anywhere in this migration. Task 2 will wire up the rest.
-- ------------------------------------------------------------
create type notification_type as enum (
  'checkin_approved',           -- used now
  'kindness_received',          -- used now
  'activity_invited',           -- reserved for Task 2
  'activity_accepted',          -- reserved for Task 2
  'activity_declined',          -- reserved for Task 2
  'activity_counter_proposed'   -- reserved for Task 2
);

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  target_member_id uuid not null references members (id) on delete cascade,
  type notification_type not null,
  message text not null,        -- final display text, composed server-side at insert time
  link_path text,                -- optional in-app path (e.g. '/missions') for the client to navigate to on tap
  metadata jsonb,                 -- optional structured extra data — NEVER used to store sender identity for kindness
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_target_unread on notifications (target_member_id, is_read);
create index idx_notifications_target_created on notifications (target_member_id, created_at desc);

alter table notifications enable row level security;

-- Read own only. No admin-sees-all policy — a member's notifications
-- are not an admin/moderation surface, unlike audit_logs.
create policy notifications_select_own on notifications
  for select using (target_member_id = auth_member_id());

-- No direct client writes at all — rows are created only by
-- create_notification() (internal) and updated only by the two
-- mark-as-read RPCs below, both SECURITY DEFINER.
revoke insert, update, delete on notifications from authenticated;

-- ------------------------------------------------------------
-- 2. create_notification() — internal-only helper.
-- Deliberately NOT granted to `authenticated`: only callable from
-- inside other SECURITY DEFINER functions (same pattern as
-- check_achievements()), so a client can never forge a notification
-- for someone else.
-- ------------------------------------------------------------
create or replace function create_notification(
  p_target_member_id uuid,
  p_type notification_type,
  p_message text,
  p_link_path text default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into notifications (target_member_id, type, message, link_path, metadata)
  values (p_target_member_id, p_type, p_message, p_link_path, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. mark_notification_read() / mark_all_notifications_read()
-- ------------------------------------------------------------
create or replace function mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  update notifications
    set is_read = true
    where id = p_notification_id and target_member_id = v_member_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function mark_notification_read(uuid) to authenticated;

create or replace function mark_all_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  update notifications set is_read = true
    where target_member_id = v_member_id and is_read = false;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function mark_all_notifications_read() to authenticated;

-- ============================================================
-- 4. Hook into give_kindness() — adds ONE notification call at the
-- very end. Every line above it (anti-abuse checks, points, sticker,
-- kindness_logs insert) is byte-for-byte identical to the live
-- version in 0004. The notification call is wrapped in its own
-- exception handler so a notification bug can NEVER roll back the
-- actual kindness reward.
--
-- Anonymity: the notification message is a static string with no
-- reference to v_from_member_id anywhere, and metadata is left null
-- — there is nothing in the notifications row that could identify
-- the sender.
-- ============================================================
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

  insert into kindness_logs (campaign_id, from_member_id, to_member_id, category, message, campaign_week)
  values (v_campaign.id, v_from_member_id, p_to_member_id, p_category, p_message, v_week)
  returning id into v_kindness_id;

  insert into points_transactions (member_id, points, source, source_ref_id)
  values (p_to_member_id, 10, 'kindness', v_kindness_id);

  insert into stickers (member_id, color, amount, source, source_ref_id)
  values (p_to_member_id, 'rainbow', 1, 'kindness', v_kindness_id);

  perform check_achievements(p_to_member_id);

  -- NEW in Task 1: notify the recipient — sender identity is never
  -- referenced here, satisfying the anonymity requirement.
  begin
    perform create_notification(
      p_to_member_id,
      'kindness_received',
      'คุณได้รับความห่วงใย (Kindness) จากเพื่อนร่วมงาน 🌈',
      '/home',
      null
    );
  exception when others then
    null; -- never let a notification failure break the kindness reward
  end;

  return jsonb_build_object('success', true, 'message', 'ส่งความห่วงใยสำเร็จ!');
end;
$$;

grant execute on function give_kindness(uuid, kindness_category, text) to authenticated;

-- ============================================================
-- 5. Hook into admin_approve_checkin() — same approach: one added
-- notification call, only on the p_approved = true branch (per
-- your clarification — "Admin อนุมัติสมาชิก" = approving a
-- proof-required check-in). Every other line is identical to the
-- live version in 0014.
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

    -- NEW in Task 1: notify the member their proof was approved.
    begin
      perform create_notification(
        v_checkin.member_id,
        'checkin_approved',
        'ภารกิจ "' || v_mission.name || '" ของคุณได้รับการอนุมัติแล้ว ได้รับ +' || v_mission.points || ' คะแนน 🎉',
        '/missions',
        jsonb_build_object('check_in_id', p_checkin_id, 'mission_id', v_mission.id)
      );
    exception when others then
      null; -- never let a notification failure break the approval
    end;
  else
    v_new_status := 'rejected';
    update check_ins set proof_status = v_new_status where id = p_checkin_id;
  end if;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id,
    (case when p_approved then 'approve_checkin' else 'reject_checkin' end)::audit_action,
    'check_in', p_checkin_id,
    jsonb_build_object('proof_status', 'pending'),
    jsonb_build_object('proof_status', v_new_status)
  );

  return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;

grant execute on function admin_approve_checkin(uuid, boolean) to authenticated;
