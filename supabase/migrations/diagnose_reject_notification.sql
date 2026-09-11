-- 1. Has any checkin_rejected notification ever been created?
select * from notifications where type = 'checkin_rejected' order by created_at desc;

-- 2. Check-ins currently rejected — pick one of these to re-test with
-- (or resubmit it as the member first, then reject again fresh).
select id, member_id, mission_id, proof_status, created_at, updated_at
from check_ins
where proof_status = 'rejected'
order by updated_at desc
limit 10;

-- 3. Confirm the notification_type enum actually has the new value.
select unnest(enum_range(null::notification_type))::text as notification_type_values;
