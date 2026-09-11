-- ============================================================
-- TASK 7 — Admin Reset System
-- Four separate, scoped reset actions. Every one of them:
--   - requires role = 'super_admin' exactly (not just is_admin())
--   - uses targeted DELETE only — never TRUNCATE/DROP
--   - writes its own audit_logs entry AFTER it runs (so the entry
--     documenting the reset survives the reset itself)
-- ============================================================

-- ------------------------------------------------------------
-- 0. is_super_admin() — stricter than is_admin(), which allows both
-- 'admin' and 'super_admin'. Reset actions require the real thing.
-- ------------------------------------------------------------
create or replace function is_super_admin() returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from members
    where auth_user_id = auth.uid() and role = 'super_admin'
  );
$$;

grant execute on function is_super_admin() to authenticated;

-- ------------------------------------------------------------
-- Admin-delete policy for the 'avatars' bucket. It only had a
-- self-delete-own-folder policy before (0029) — this adds the
-- ability for an admin to delete OTHER members' avatar files,
-- needed for the post-reset storage cleanup step. Both policies
-- coexist (a user may delete their own OR be an admin).
-- ------------------------------------------------------------
create policy "avatar_delete_admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from members where auth_user_id = auth.uid() and role in ('admin', 'super_admin')
  )
);

-- ============================================================
-- 1. admin_reset_results() — wipes activity/score data only.
-- Members, missions, and campaigns are completely untouched.
-- ============================================================
create or replace function admin_reset_results()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_counts jsonb;
begin
  if not is_super_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select jsonb_build_object(
    'check_ins', (select count(*) from check_ins),
    'points_transactions', (select count(*) from points_transactions),
    'stickers', (select count(*) from stickers),
    'kindness_logs', (select count(*) from kindness_logs),
    'buddy_groups', (select count(*) from buddy_groups),
    'squads', (select count(*) from squads),
    'member_badges', (select count(*) from member_badges),
    'notifications', (select count(*) from notifications),
    'activity_invitations', (select count(*) from activity_invitations),
    'activity_proposals', (select count(*) from activity_proposals),
    'audit_logs', (select count(*) from audit_logs)
  ) into v_counts;

  delete from check_ins;
  delete from points_transactions;
  delete from stickers;
  delete from kindness_logs;
  delete from buddy_members;
  delete from buddy_groups;
  delete from squad_members;
  delete from squads;
  delete from member_badges;
  delete from notifications;
  delete from activity_votes;
  delete from activity_proposals;
  delete from activity_invitations;
  delete from audit_logs;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'system_reset', null, jsonb_build_object('type', 'reset_results', 'counts_before', v_counts));

  return jsonb_build_object('success', true, 'counts_before', v_counts);
end;
$$;

grant execute on function admin_reset_results() to authenticated;

-- ============================================================
-- 2. admin_reset_missions() — clears mission definitions. Since
-- points_transactions/stickers.source_ref_id is a soft reference
-- (no real FK — see analysis), mission-sourced rows there are
-- cleared first to avoid leaving orphaned records with no
-- resolvable source. check_ins cascade away automatically once
-- their mission is deleted.
-- ============================================================
create or replace function admin_reset_missions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_mission_count int;
begin
  if not is_super_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select count(*) into v_mission_count from missions;

  delete from points_transactions where source = 'mission';
  delete from stickers where source = 'mission';
  delete from missions; -- cascades check_ins automatically

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'system_reset', null, jsonb_build_object('type', 'reset_missions', 'missions_removed', v_mission_count));

  return jsonb_build_object('success', true, 'missions_removed', v_mission_count);
end;
$$;

grant execute on function admin_reset_missions() to authenticated;

-- ============================================================
-- 3. admin_reset_members() — removes every member except the
-- caller, and their auth.users login. Two FK landmines defused
-- first (see analysis): audit_logs.admin_id and
-- activity_proposals.reviewed_by have no cascade and would block
-- deletion otherwise. Returns the removed auth_user_ids so the
-- client can clean up their Storage folders afterward — there is
-- no way to recover that mapping once the member rows are gone.
-- ============================================================
create or replace function admin_reset_members()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calling_member_id uuid;
  v_removed_auth_ids uuid[];
  v_removed_count int;
begin
  if not is_super_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_calling_member_id := auth_member_id();

  delete from audit_logs;
  update activity_proposals set reviewed_by = null;

  select array_agg(auth_user_id) into v_removed_auth_ids
    from members
    where id <> v_calling_member_id and auth_user_id is not null;

  select count(*) into v_removed_count from members where id <> v_calling_member_id;

  delete from auth.users where id = any(v_removed_auth_ids);
  delete from members where id <> v_calling_member_id;

  -- Tidy up any now-empty group shells the member cascade left behind.
  delete from buddy_groups bg where not exists (select 1 from buddy_members bm where bm.buddy_group_id = bg.id);
  delete from squads s where not exists (select 1 from squad_members sm where sm.squad_id = s.id);

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (
    v_calling_member_id, 'other', 'system_reset', null,
    jsonb_build_object('type', 'reset_members', 'members_removed', v_removed_count)
  );

  return jsonb_build_object(
    'success', true,
    'members_removed', v_removed_count,
    'removed_auth_ids', to_jsonb(coalesce(v_removed_auth_ids, array[]::uuid[]))
  );
end;
$$;

grant execute on function admin_reset_members() to authenticated;

-- ============================================================
-- 4. admin_reset_all() — results + members together. Missions and
-- campaigns are still untouched (confirmed scope) — call
-- admin_reset_missions() separately if that's also wanted.
-- ============================================================
create or replace function admin_reset_all()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_results_summary jsonb;
  v_members_summary jsonb;
begin
  if not is_super_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  v_results_summary := admin_reset_results();
  v_members_summary := admin_reset_members();

  -- admin_reset_members() already wrote its own audit entry (and, in
  -- the process, wiped the one admin_reset_results() wrote) — add one
  -- final combined entry so the surviving record accurately reflects
  -- that this was a full "reset all", not just a members reset.
  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (
    v_admin_id, 'other', 'system_reset', null,
    jsonb_build_object('type', 'reset_all', 'results', v_results_summary, 'members', v_members_summary)
  );

  return jsonb_build_object('success', true, 'results', v_results_summary, 'members', v_members_summary);
end;
$$;

grant execute on function admin_reset_all() to authenticated;
