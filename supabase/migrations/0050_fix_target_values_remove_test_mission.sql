-- 1. Fix target_value to match what the description actually says
update missions set target_value = 80000 where name = 'Buddy Walk';
update missions set target_value = 100000 where name = 'Big Step Challenge';

-- 2. Remove the test mission "Know Me Mood" — clean up any orphaned
-- points_transactions/stickers first (source_ref_id -> check_ins.id
-- is a soft reference, no FK cascade), then delete the mission
-- itself (check_ins cascade away automatically via their real FK).
delete from points_transactions
  where source = 'mission'
    and source_ref_id in (select id from check_ins where mission_id = (select id from missions where name = 'Know Me Mood'));

delete from stickers
  where source = 'mission'
    and source_ref_id in (select id from check_ins where mission_id = (select id from missions where name = 'Know Me Mood'));

delete from missions where name = 'Know Me Mood';
