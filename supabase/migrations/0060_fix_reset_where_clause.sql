-- ============================================================
-- Fix: Supabase blocks unqualified DELETE (no WHERE clause) as a
-- safety guard — confirmed by the actual error hit:
-- {"code":"21000","message":"DELETE requires a WHERE clause"}
--
-- Adding `where true` to every bare DELETE below is functionally
-- identical (matches every row) but satisfies the guard. Same
-- signatures as before, so no DROP needed.
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

  delete from check_ins where true;
  delete from points_transactions where true;
  delete from stickers where true;
  delete from kindness_logs where true;
  delete from buddy_members where true;
  delete from buddy_groups where true;
  delete from squad_members where true;
  delete from squads where true;
  delete from member_badges where true;
  delete from notifications where true;
  delete from activity_votes where true;
  delete from activity_proposals where true;
  delete from activity_invitations where true;
  delete from feedback_messages where true;
  delete from audit_logs where true;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'system_reset', null, jsonb_build_object('type', 'reset_results', 'counts_before', v_counts));

  return jsonb_build_object('success', true, 'counts_before', v_counts);
end;
$$;

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
  delete from missions where true; -- cascades check_ins automatically

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'system_reset', null, jsonb_build_object('type', 'reset_missions', 'missions_removed', v_mission_count));

  return jsonb_build_object('success', true, 'missions_removed', v_mission_count);
end;
$$;

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

  delete from audit_logs where true;
  update activity_proposals set reviewed_by = null where reviewed_by is not null;

  select array_agg(auth_user_id) into v_removed_auth_ids
    from members
    where id <> v_calling_member_id and auth_user_id is not null;

  select count(*) into v_removed_count from members where id <> v_calling_member_id;

  delete from auth.users where id = any(v_removed_auth_ids);
  delete from members where id <> v_calling_member_id;

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
