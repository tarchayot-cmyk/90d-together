-- ============================================================
-- RESET SCRIPT — ล้างข้อมูลสมาชิกและกิจกรรมทั้งหมด เหลือแค่ super admin
--
-- ⚠️ อ่านก่อนรัน:
-- - ลบถาวร กู้คืนไม่ได้ — export ข้อมูลสำรองก่อนถ้าต้องการ
-- - เก็บไว้: campaign, mission (นิยามภารกิจ), badge (นิยามเหรียญ),
--   บัญชี super_admin ทั้งหมด
-- - ลบทิ้ง: สมาชิกทุกคนที่ไม่ใช่ super_admin (รวม admin ธรรมดา),
--   check-in, คะแนน, สติ๊กเกอร์, badge ที่ปลดล็อก, kindness,
--   กลุ่ม buddy/squad, คำเชิญ, ข้อเสนอกิจกรรม, การแจ้งเตือน,
--   audit log, และ auth user ของคนที่ถูกลบ
--
-- รันทั้งไฟล์รอบเดียว (เป็น transaction เดียว — ถ้า error จะ
-- rollback ทั้งหมด ไม่ทิ้งสถานะครึ่งๆ กลางๆ)
-- ============================================================

-- ตรวจก่อนลบ: ต้องมี super_admin เหลืออยู่อย่างน้อย 1 คน
do $$
declare
  v_super_count int;
begin
  select count(*) into v_super_count from members where role = 'super_admin';
  if v_super_count = 0 then
    raise exception 'ไม่พบบัญชี super_admin เลย — ยกเลิกการ reset เพื่อไม่ให้ล็อกตัวเองออกจากระบบ';
  end if;
  raise notice 'พบ super_admin % บัญชี — จะเก็บไว้', v_super_count;
end $$;

-- เก็บ auth_user_id ของคนที่จะถูกลบไว้ก่อน (ต้องใช้ลบ auth user ทีหลัง)
create temp table _to_delete_auth_ids as
select auth_user_id from members where role <> 'super_admin' and auth_user_id is not null;

-- ------------------------------------------------------------
-- 1. ลบข้อมูลกิจกรรมทั้งหมด (ของทุกคน รวม super admin ด้วย
--    เพื่อให้เริ่มนับใหม่จากศูนย์จริงๆ)
-- ------------------------------------------------------------
delete from notifications;
delete from activity_votes;
delete from activity_proposals;
delete from activity_invitations;
delete from kindness_logs;
delete from member_badges;
delete from stickers;
delete from points_transactions;
delete from check_ins;
delete from buddy_members;
delete from buddy_groups;
delete from squad_members;
delete from squads;
delete from audit_logs;

-- ------------------------------------------------------------
-- 2. ลบสมาชิกที่ไม่ใช่ super_admin
-- ------------------------------------------------------------
delete from members where role <> 'super_admin';

-- ------------------------------------------------------------
-- 3. ลบ auth user ที่ไม่มี member ผูกอยู่แล้ว
--    (ถ้าขั้นนี้ error เรื่องสิทธิ์ ให้ข้ามไปได้ — auth user ที่
--     เหลือค้างจะไม่มีผลต่อการใช้งาน เพราะ login ผ่าน members)
-- ------------------------------------------------------------
delete from auth.users where id in (select auth_user_id from _to_delete_auth_ids);

drop table _to_delete_auth_ids;

-- ------------------------------------------------------------
-- 4. สรุปผลหลัง reset
-- ------------------------------------------------------------
select
  (select count(*) from members) as members_remaining,
  (select count(*) from members where role = 'super_admin') as super_admins,
  (select count(*) from check_ins) as check_ins,
  (select count(*) from points_transactions) as points_rows,
  (select count(*) from member_badges) as badges_unlocked,
  (select count(*) from missions) as missions_kept,
  (select count(*) from badges) as badge_definitions_kept,
  (select count(*) from campaigns) as campaigns_kept;
