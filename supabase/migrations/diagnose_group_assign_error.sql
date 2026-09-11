-- Run each SELECT separately and check the results

-- 1. Should be >= 1 (need at least 1 participant to form a group)
select count(*) as active_participants
from members where role = 'participant' and is_active = true;

-- 2. Should be exactly 1 row (if 0 or 2+, that's likely the bug)
select id, name, start_date, end_date, is_active
from campaigns where is_active = true;

-- 3. Confirms the tables from Sprint 3 actually exist
select table_name from information_schema.tables
where table_name in ('buddy_groups', 'buddy_members', 'squads', 'squad_members');
