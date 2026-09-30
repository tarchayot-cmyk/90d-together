-- Restore theme/input_type/max_per_day/max_per_week for 9 missions that
-- got silently reset to theme='move', input_type='numeric', max_per_day=null,
-- max_per_week=1 by the admin missions page's toggleActive() calling
-- admin_upsert_mission() without those params (which fall back to the
-- function's defaults). Correct values reconstructed from audit_logs
-- (the old_value snapshot recorded just before each corrupting edit).
-- Applied directly via Supabase MCP; this file just records it in git.
-- This only updates mission definitions, not any already-earned
-- points/stickers/check-ins.

update missions set theme='fuel', input_type='checkbox', max_per_day=1, max_per_week=4
  where id = '23997574-d540-4003-acff-9382abd3a473'; -- นับแก้วน้ำดื่ม

update missions set theme='mind', input_type='checkbox', max_per_day=1, max_per_week=1
  where id = '2d3b9875-23d2-4adb-9b72-3e70d875bd8a'; -- Proud Moment

update missions set theme='connect', input_type='checkbox', max_per_day=1, max_per_week=1
  where id = '5e4a19a7-f3d4-42ef-9997-814515497e83'; -- โทร/แชทครอบครัว-เพื่อนสนิท

update missions set theme='connect', input_type='checkbox', max_per_day=1, max_per_week=3
  where id = '64fa3588-3e94-41bd-921c-b188216a7b35'; -- ชวนทานข้าวเที่ยงด้วยกัน

update missions set theme='fuel', input_type='checkbox', max_per_day=1, max_per_week=2
  where id = '6768766f-1177-405b-8837-8aaf3a6870ec'; -- ทำอาหารเพื่อสุขภาพมาเอง

update missions set theme='fuel', input_type='checkbox', max_per_day=1, max_per_week=1
  where id = '1d6bab85-5776-4153-afcd-924aa502015f'; -- ลองสูตรอาหารเพื่อสุขภาพใหม่

update missions set theme='mind', input_type='checkbox', max_per_day=1, max_per_week=1
  where id = '69d12e1d-44a4-41bc-865e-c7c0646995b1'; -- เขียนบันทึกขอบคุณ 3 ข้อ/สัปดาห์

update missions set theme='connect', input_type='checkbox', max_per_day=1, max_per_week=1
  where id = '83498dc5-8aea-449d-ad7d-5f0ff95a26d4'; -- แบ่งปันเคล็ดลับสุขภาพใน line openchat

update missions set theme='fuel', input_type='checkbox', max_per_day=1, max_per_week=4
  where id = 'ae4e051c-674a-44e2-8fc4-dd8c7561afcd'; -- กินมื้อเช้าแล้ว
