-- ============================================================
-- Reset after pilot testing (2-3 test users)
-- Wipes ALL activity data + removes participant test accounts.
-- KEEPS: admin/super_admin accounts, mission definitions, badge
-- definitions, and the campaigns table itself (only clears its
-- activity, doesn't delete the campaign row).
--
-- Run this in the SQL Editor. You'll see the "destructive
-- operations" warning — that's expected, this genuinely deletes
-- data on purpose. Read it once more before clicking Run.
-- ============================================================

-- 1. Wipe all activity data (order matters: children before parents)
delete from audit_logs;
delete from member_badges;
delete from kindness_logs;
delete from stickers;
delete from points_transactions;
delete from check_ins;
delete from buddy_members;
delete from buddy_groups;
delete from squad_members;
delete from squads;

-- 2. Remove test participant accounts entirely (both their login
--    and their member row) — admins are untouched.
do $$
declare
  r record;
begin
  for r in select id, auth_user_id from members where role = 'participant'
  loop
    delete from auth.users where id = r.auth_user_id;
  end loop;
  delete from members where role = 'participant';
end $$;

-- 3. Sanity check — should show only your admin account(s) left,
--    and zero rows in every activity table.
select 'members' as table_name, count(*) from members
union all select 'check_ins', count(*) from check_ins
union all select 'points_transactions', count(*) from points_transactions
union all select 'stickers', count(*) from stickers
union all select 'kindness_logs', count(*) from kindness_logs
union all select 'member_badges', count(*) from member_badges
union all select 'buddy_groups', count(*) from buddy_groups
union all select 'squads', count(*) from squads
union all select 'audit_logs', count(*) from audit_logs;
