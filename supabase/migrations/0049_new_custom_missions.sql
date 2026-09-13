-- ============================================================
-- New custom missions requested — all use category='other' (the
-- catch-all added in 0040) since none map to the existing 12
-- specific badge-tracked categories. They'll still count toward the
-- generic badges (total_completions, total_points, distinct_types,
-- streak, all_complete_weeks) at their level, just not toward any
-- single-mission-specific badge family.
--
-- Descriptions with a link/questions to fill in later are marked
-- with [ADMIN: ...] placeholders — edit them via /admin/missions
-- once the real link/content is ready.
-- ============================================================
do $$
declare
  v_campaign_id uuid;
begin
  select id into v_campaign_id from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign_id is null then
    raise exception 'no_active_campaign_found — สร้าง/เปิด campaign ก่อนรันไฟล์นี้';
  end if;

  insert into missions (
    campaign_id, level, category, name, description,
    target_value, unit, points, sticker_color, sticker_amount,
    requires_proof, is_active, input_type, max_per_week, max_per_day
  ) values
    -- 1. เดิน 15 นาทีหลังกินข้าว
    (v_campaign_id, 'me', 'other', 'เดิน 15 นาทีหลังกินข้าว',
     'เดินอย่างน้อย 15 นาทีหลังมื้ออาหาร ช่วยระบบย่อยอาหารและเผาผลาญพลังงาน',
     1, 'ครั้ง', 5, 'green', 1, false, true, 'checkbox', 7, 1),

    -- 2. นับแก้วน้ำดื่ม
    (v_campaign_id, 'me', 'other', 'นับแก้วน้ำดื่ม',
     'ดื่มน้ำให้ได้อย่างน้อย 8 แก้ว หรือ 1.5 ลิตรต่อวัน',
     8, 'แก้ว', 5, 'yellow', 1, false, true, 'numeric', 7, 1),

    -- 3. ยืดเหยียดกล้ามเนื้อ
    (v_campaign_id, 'me', 'other', 'ยืดเหยียดกล้ามเนื้อ',
     'ยืดเหยียดกล้ามเนื้อช่วงก่อนเที่ยง หรือหลังเลิกงาน',
     1, 'ครั้ง', 5, 'purple', 1, false, true, 'checkbox', 7, 1),

    -- 4. งดใช้มือถือ 1 ชั่วโมง
    (v_campaign_id, 'me', 'other', 'งดใช้มือถือ 1 ชั่วโมง',
     'ปิด/วางมือถือต่อเนื่อง 1 ชั่วโมงเต็ม',
     1, 'ครั้ง', 5, 'orange', 1, false, true, 'checkbox', 7, 1),

    -- 5. แบบทดสอบภาวะรับรู้ทางอารมณ์
    (v_campaign_id, 'me', 'other', 'แบบทดสอบภาวะรับรู้ทางอารมณ์',
     'ทำแบบทดสอบภาวะรับรู้ทางอารมณ์ของกรมสุขภาพจิต แล้วแคปหน้าจอผลลัพธ์แนบเป็นหลักฐาน '
     || '[ADMIN: ใส่ลิงก์แบบทดสอบตรงนี้ — แนะนำทำซ้ำห่างกันอย่างน้อย 30 วัน]',
     1, 'ครั้ง', 10, 'purple', 1, true, true, 'checkbox', 1, null),

    -- 6. แบบประเมินพฤติกรรมตนเอง + วางแผนปรับพฤติกรรม
    (v_campaign_id, 'me', 'other', 'ประเมินพฤติกรรมตนเอง + วางแผนปรับพฤติกรรม',
     'ทำแบบประเมินพฤติกรรมตนเองและวางแผนปรับพฤติกรรมประจำเดือน แคปหน้าจอผลลัพธ์แนบเป็นหลักฐาน '
     || '[ADMIN: อัปเดตลิงก์แบบฟอร์มของเดือนนี้ตรงนี้]',
     1, 'ครั้ง', 10, 'purple', 1, true, true, 'checkbox', 1, null),

    -- 7. ชมคลิปวิดีโอ + ตอบคำถาม
    (v_campaign_id, 'me', 'other', 'ชมคลิปวิดีโอ + ตอบคำถามท้ายคลิป',
     'ชมคลิปวิดีโอที่กำหนด แล้วตอบคำถามท้ายคลิป แคปหน้าจอผลลัพธ์แนบเป็นหลักฐาน '
     || '[ADMIN: ใส่ลิงก์คลิป + ลิงก์แบบคำถามของสัปดาห์นี้ตรงนี้]',
     1, 'ครั้ง', 10, 'orange', 1, true, true, 'checkbox', 1, null),

    -- 8. เข้าร่วมกิจกรรมทางศาสนา
    (v_campaign_id, 'me', 'other', 'เข้าร่วมกิจกรรมทางศาสนา',
     'เช่น ทำวัตรเช้า ใส่บาตร ไปโบสถ์ หรือกิจกรรมทางศาสนา/ความเชื่อส่วนบุคคลอื่นๆ (ไม่ต้องแนบหลักฐาน เคารพความเป็นส่วนตัว)',
     1, 'ครั้ง', 1, 'rainbow', 1, false, true, 'checkbox', 7, 1),

    -- 9. Proud Moment
    (v_campaign_id, 'me', 'other', 'Proud Moment',
     'แนบรูปโพสต์อวดผลงาน/ความสำเร็จที่ภูมิใจในเดือนนี้',
     1, 'ครั้ง', 10, 'rainbow', 1, true, true, 'checkbox', 1, null),

    -- 10. ยืดเหยียดก่อนกินข้าวแบบหมู่คณะ (WE)
    (v_campaign_id, 'we', 'other', 'ยืดเหยียดก่อนกินข้าวแบบหมู่คณะ',
     'ยืดเหยียดร่วมกันทั้งห้อง/แผนกก่อนมื้ออาหาร แนบรูปตอนทำร่วมกันเป็นหลักฐาน',
     1, 'ครั้ง', 5, 'green', 1, true, true, 'checkbox', 1, null);
end $$;
