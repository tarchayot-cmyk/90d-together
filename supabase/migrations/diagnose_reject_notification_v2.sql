select
  position('checkin_rejected' in prosrc) > 0 as function_has_reject_notification_code,
  position('checkin_approved' in prosrc) > 0 as function_has_approve_notification_code
from pg_proc
where proname = 'admin_approve_checkin';
