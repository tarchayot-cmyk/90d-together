-- ============================================================
-- RESET RESULTS — ล้างเฉพาะ "ผลลัพธ์กิจกรรม" ทั้งหมด
-- เก็บไว้: สมาชิกทุกคน, ภารกิจ, badge definitions, campaign
-- ลบทิ้ง: check-in, คะแนน, สติ๊กเกอร์, kindness, กลุ่ม Buddy/Squad,
--         badge ที่ปลดล็อกแล้ว, การแจ้งเตือน, คำเชิญ, ข้อเสนอกิจกรรม,
--         audit log, คำถาม/ข้อเสนอแนะ (feedback)
--
-- ตรงกับสิ่งที่ admin_reset_results() ทำ (ใช้ผ่านหน้า /admin/system
-- ได้เหมือนกัน) แต่นี่คือ SQL ตรงสำหรับรันเองใน SQL Editor
-- ============================================================

-- สรุปจำนวนก่อนลบ (ดูเป็นข้อมูลอ้างอิง)
select
  (select count(*) from check_ins) as check_ins,
  (select count(*) from points_transactions) as points_transactions,
  (select count(*) from stickers) as stickers,
  (select count(*) from kindness_logs) as kindness_logs,
  (select count(*) from buddy_groups) as buddy_groups,
  (select count(*) from squads) as squads,
  (select count(*) from member_badges) as member_badges,
  (select count(*) from notifications) as notifications,
  (select count(*) from activity_invitations) as activity_invitations,
  (select count(*) from activity_proposals) as activity_proposals,
  (select count(*) from feedback_messages) as feedback_messages,
  (select count(*) from audit_logs) as audit_logs;

delete from check_ins;
delete from points_transactions;
delete from stickers;
delete from kindness_logs;
delete from buddy_members;
delete from buddy_groups;
delete from squad_members;
delete from squads;
delete from member_badges;
delete from notifications;
delete from activity_votes;
delete from activity_proposals;
delete from activity_invitations;
delete from feedback_messages;
delete from audit_logs;

-- ยืนยันผลหลังลบ (ทุกค่าควรเป็น 0)
select
  (select count(*) from check_ins) as check_ins,
  (select count(*) from points_transactions) as points_transactions,
  (select count(*) from stickers) as stickers,
  (select count(*) from kindness_logs) as kindness_logs,
  (select count(*) from buddy_groups) as buddy_groups,
  (select count(*) from squads) as squads,
  (select count(*) from member_badges) as member_badges,
  (select count(*) from notifications) as notifications,
  (select count(*) from activity_invitations) as activity_invitations,
  (select count(*) from activity_proposals) as activity_proposals,
  (select count(*) from feedback_messages) as feedback_messages,
  (select count(*) from audit_logs) as audit_logs,
  (select count(*) from members) as members_kept,
  (select count(*) from missions) as missions_kept,
  (select count(*) from badges) as badges_kept;
