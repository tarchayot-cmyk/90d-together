-- ============================================================
-- These 6 categories existed in mission_category since Sprint 1,
-- but were never actually inserted as real missions — only
-- 'buddy_walk' and 'big_step' from the original WE/US plan were
-- ever seeded (0003). Creating the rest now to complete the
-- original 8-mission WE/US set, matching the theme redesign that
-- follows in 0051.
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
    -- WE
    (v_campaign_id, 'we', 'buddy_lunch', 'Buddy Lunch',
     'ทานมื้อกลางวันเพื่อสุขภาพร่วมกับ Buddy อย่างน้อย 1 ครั้ง/สัปดาห์',
     1, 'ครั้ง', 20, 'green', 2, false, true, 'checkbox', 1, null),

    (v_campaign_id, 'we', 'hydration_buddy', 'Hydration Buddy',
     'ดื่มน้ำให้ได้อย่างน้อย 8 แก้วต่อวัน ชวน Buddy มาทำไปด้วยกัน',
     8, 'แก้ว', 20, 'yellow', 2, false, true, 'numeric', 1, null),

    (v_campaign_id, 'we', 'buddy_stretch', 'Buddy Stretch',
     'ยืดเหยียดร่างกายร่วมกับ Buddy อย่างน้อย 1 ครั้ง/สัปดาห์',
     1, 'ครั้ง', 20, 'purple', 2, false, true, 'checkbox', 1, null),

    -- US
    (v_campaign_id, 'us', 'zero_sugar_squad', 'Zero Sugar Squad',
     'งดเครื่องดื่ม/ของหวานที่มีน้ำตาลสูง ให้ได้อย่างน้อย 5 วันในสัปดาห์นี้ ร่วมกับ Squad',
     5, 'วัน', 30, 'red', 3, false, true, 'numeric', 1, null),

    (v_campaign_id, 'us', 'lunch_walk_talk', 'Lunch Walk & Talk',
     'เดินคุยกันช่วงพักเที่ยงกับเพื่อนใน Squad อย่างน้อย 1 ครั้ง/สัปดาห์',
     1, 'ครั้ง', 30, 'orange', 3, false, true, 'checkbox', 1, null),

    (v_campaign_id, 'us', 'gratitude', 'Gratitude',
     'เขียน/พูดขอบคุณสิ่งดีๆ ที่เกิดขึ้นในสัปดาห์นี้ ร่วมแบ่งปันกับ Squad',
     1, 'ครั้ง', 30, 'rainbow', 3, false, true, 'checkbox', 1, null)
  on conflict do nothing;
end $$;
