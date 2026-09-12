-- เช็คว่ามีฟังก์ชัน delete_notification กี่เวอร์ชันในฐานข้อมูลจริง
-- (ควรมีแค่ 1 แถว รับ parameter เดียวชื่อ p_notification_id ชนิด uuid)
select
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_notification';
