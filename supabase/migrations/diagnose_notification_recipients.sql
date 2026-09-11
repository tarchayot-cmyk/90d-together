select
  n.type,
  n.message,
  n.is_read,
  n.created_at,
  m.full_name as recipient_name,
  m.employee_code as recipient_employee_code
from notifications n
join members m on m.id = n.target_member_id
order by n.created_at desc;
