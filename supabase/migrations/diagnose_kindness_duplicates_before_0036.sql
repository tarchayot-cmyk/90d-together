-- Run this BEFORE 0036_task13_kindness_race_condition_fix.sql.
-- If this returns 0 rows, the new unique constraint will apply
-- cleanly — just proceed to 0036 as normal.
-- If it returns any rows, that pair/week already has duplicate
-- kindness_logs entries (meaning the race condition already
-- happened at least once) — the ALTER TABLE in 0036 will fail
-- until these are cleaned up. Come back and ask before deleting
-- anything if this finds rows.
select from_member_id, to_member_id, campaign_week, count(*)
from kindness_logs
group by from_member_id, to_member_id, campaign_week
having count(*) > 1;
