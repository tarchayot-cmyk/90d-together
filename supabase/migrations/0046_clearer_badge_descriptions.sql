-- ============================================================
-- Clearer badge descriptions — state WHAT was completed, not just
-- a bare count. e.g. "นักวินัย" bulk tier changes from
-- "ทำสำเร็จรวม 4 ครั้ง" to "ทำภารกิจ ME ข้อใดก็ได้สำเร็จรวม 4 ครั้ง"
-- Pure UPDATE by family_code+tier — no criteria/logic changes at all.
-- ============================================================
do $$
declare
  v_prefix text;
  v_level_label text;
  v_mission_1_name text; v_mission_2_name text; v_mission_3_name text; v_mission_4_name text;
begin
  for v_prefix, v_level_label, v_mission_1_name, v_mission_2_name, v_mission_3_name, v_mission_4_name in
    values
      ('me', 'ME', 'Move Me', 'Sleep Me', 'Eat Me', 'Know Me'),
      ('we', 'WE', 'Buddy Walk', 'Buddy Lunch', 'Hydration Buddy', 'Buddy Stretch'),
      ('us', 'US', 'Big Step Challenge', 'Zero Sugar Squad', 'Lunch Walk & Talk', 'Gratitude')
  loop
    -- per-mission badges (m1-m4): name which mission explicitly
    update badges set description = 'ทำภารกิจ "' || v_mission_1_name || '" สำเร็จ 1 สัปดาห์' where family_code = v_prefix||'_m1' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ "' || v_mission_1_name || '" สำเร็จ 3 สัปดาห์' where family_code = v_prefix||'_m1' and tier = 'lean';
    update badges set description = 'ทำภารกิจ "' || v_mission_1_name || '" สำเร็จครบ 5 สัปดาห์' where family_code = v_prefix||'_m1' and tier = 'smart';

    update badges set description = 'ทำภารกิจ "' || v_mission_2_name || '" สำเร็จ 1 สัปดาห์' where family_code = v_prefix||'_m2' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ "' || v_mission_2_name || '" สำเร็จ 3 สัปดาห์' where family_code = v_prefix||'_m2' and tier = 'lean';
    update badges set description = 'ทำภารกิจ "' || v_mission_2_name || '" สำเร็จครบ 5 สัปดาห์' where family_code = v_prefix||'_m2' and tier = 'smart';

    update badges set description = 'ทำภารกิจ "' || v_mission_3_name || '" สำเร็จ 1 สัปดาห์' where family_code = v_prefix||'_m3' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ "' || v_mission_3_name || '" สำเร็จ 3 สัปดาห์' where family_code = v_prefix||'_m3' and tier = 'lean';
    update badges set description = 'ทำภารกิจ "' || v_mission_3_name || '" สำเร็จครบ 5 สัปดาห์' where family_code = v_prefix||'_m3' and tier = 'smart';

    update badges set description = 'ทำภารกิจ "' || v_mission_4_name || '" สำเร็จ 1 สัปดาห์' where family_code = v_prefix||'_m4' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ "' || v_mission_4_name || '" สำเร็จ 3 สัปดาห์' where family_code = v_prefix||'_m4' and tier = 'lean';
    update badges set description = 'ทำภารกิจ "' || v_mission_4_name || '" สำเร็จครบ 5 สัปดาห์' where family_code = v_prefix||'_m4' and tier = 'smart';

    -- ครบเซ็ต
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' ครบทั้ง 4 อย่างภายในสัปดาห์เดียวกัน (1 สัปดาห์)' where family_code = v_prefix||'_all' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' ครบทั้ง 4 อย่างในสัปดาห์เดียวกัน รวม 3 สัปดาห์' where family_code = v_prefix||'_all' and tier = 'lean';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' ครบทั้ง 4 อย่างในสัปดาห์เดียวกัน ทุกสัปดาห์ (5 สัปดาห์)' where family_code = v_prefix||'_all' and tier = 'smart';

    -- ขยันไม่หยุด (streak)
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' สำเร็จอย่างน้อย 1 อย่างต่อสัปดาห์ ติดต่อกัน 2 สัปดาห์' where family_code = v_prefix||'_streak' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' สำเร็จอย่างน้อย 1 อย่างต่อสัปดาห์ ติดต่อกัน 3 สัปดาห์' where family_code = v_prefix||'_streak' and tier = 'lean';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' สำเร็จอย่างน้อย 1 อย่างต่อสัปดาห์ ติดต่อกันตลอดเฟส (5 สัปดาห์)' where family_code = v_prefix||'_streak' and tier = 'smart';

    -- สะสมก้าว (names the specific step mission)
    update badges set description = 'สะสมก้าวจากภารกิจ "' || v_mission_1_name || '" รวม 50,000 ก้าว' where family_code = v_prefix||'_steps' and tier = 'bulk';
    update badges set description = 'สะสมก้าวจากภารกิจ "' || v_mission_1_name || '" รวม 150,000 ก้าว' where family_code = v_prefix||'_steps' and tier = 'lean';
    update badges set description = 'สะสมก้าวจากภารกิจ "' || v_mission_1_name || '" รวม 250,000 ก้าว' where family_code = v_prefix||'_steps' and tier = 'smart';

    -- นักวินัย (completions) — the example the user pointed out
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' ข้อใดก็ได้สำเร็จ รวมทั้งหมด 4 ครั้ง' where family_code = v_prefix||'_completions' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' ข้อใดก็ได้สำเร็จ รวมทั้งหมด 12 ครั้ง' where family_code = v_prefix||'_completions' and tier = 'lean';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' ข้อใดก็ได้สำเร็จ รวมทั้งหมด 20 ครั้ง' where family_code = v_prefix||'_completions' and tier = 'smart';

    -- ครบทุกมิติ (distinct types)
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' สำเร็จอย่างน้อย 2 ประเภทที่ต่างกัน (จากทั้งหมด 4 ประเภท)' where family_code = v_prefix||'_types' and tier = 'bulk';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' สำเร็จอย่างน้อย 3 ประเภทที่ต่างกัน (จากทั้งหมด 4 ประเภท)' where family_code = v_prefix||'_types' and tier = 'lean';
    update badges set description = 'ทำภารกิจ ' || v_level_label || ' สำเร็จครบทั้ง 4 ประเภท' where family_code = v_prefix||'_types' and tier = 'smart';

    -- จัดเต็ม (total points) — keep the point numbers, just clarify source
    update badges set description = regexp_replace(description, 'ได้ (.*) คะแนนในเฟสนี้', 'สะสมคะแนนจากภารกิจ ' || v_level_label || ' รวม \1 คะแนน')
      where family_code = v_prefix||'_points';
  end loop;
end $$;
