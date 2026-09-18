select
  k.created_at as วันที่ส่ง,
  k.campaign_week as สัปดาห์ที่,
  sender.full_name as ผู้ส่ง,
  sender.employee_code as รหัสผู้ส่ง,
  receiver.full_name as ผู้รับ,
  receiver.employee_code as รหัสผู้รับ,
  k.category as ประเภท,
  k.message as ข้อความ
from kindness_logs k
join members sender on sender.id = k.from_member_id
join members receiver on receiver.id = k.to_member_id
order by k.created_at desc;
