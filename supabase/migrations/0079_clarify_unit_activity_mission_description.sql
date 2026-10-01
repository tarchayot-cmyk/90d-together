-- Clarify the "เข้าร่วมกิจกรรมหน่วยงาน" mission's eligibility criteria:
-- routine required meetings (unit meetings, production meetings) do
-- NOT qualify, only special/extracurricular relationship-building
-- activities do (parties, team building, sports day, etc). Applied
-- directly via Supabase MCP; this file just records the migration in
-- git.

update missions
set description = 'เข้าร่วมกิจกรรมพิเศษของหน่วยงาน/แผนก (เช่น งานเลี้ยง สังสรรค์ team building กีฬาสี) — ไม่นับประชุมงานประจำ แนบรูปเป็นหลักฐาน'
where id = '12198158-3a6c-4981-a8e6-5d24368caef3';
