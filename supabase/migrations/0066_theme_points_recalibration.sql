-- ============================================================
-- PART 1 — Fix theme + sticker_color corrupted by the missing-key
-- form bug. Only theme/sticker_color change — nothing else touched
-- (points, limits, target_value all preserved as-is).
-- ============================================================
update missions set theme = 'fuel', sticker_color = 'red' where name in ('Eat Me', 'นับแก้วน้ำดื่ม');
update missions set theme = 'rest', sticker_color = 'pink' where name = 'Sleep Me';
update missions set theme = 'mind', sticker_color = 'purple' where name in (
  'Know Me', 'งดใช้มือถือ 1 ชั่วโมง', 'ชมคลิปวิดีโอ + ตอบคำถามท้ายคลิป',
  'แบบทดสอบภาวะรับรู้ทางอารมณ์', 'ประเมินพฤติกรรมตนเอง + วางแผนปรับพฤติกรรม', 'เข้าร่วมกิจกรรมทางศาสนา'
);
update missions set sticker_color = 'orange' where name = 'ทักทายยามเช้า'; -- theme already correct (connect)
update missions set sticker_color = 'yellow' where name in (
  'Move Me', 'Airobic for all', 'Run /walk > 2.5 km', 'เดิน 15 นาทีหลังกินข้าว', 'ยืดเหยียดกล้ามเนื้อ'
); -- theme already correct (move)

-- ============================================================
-- PART 2 — 27 new ME missions, agreed points/limits/proof rules
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
    campaign_id, level, category, theme, name, description,
    target_value, unit, points, sticker_color, sticker_amount,
    requires_proof, is_active, input_type, max_per_week, max_per_day
  ) values
    -- move (yellow)
    (v_campaign_id, 'me', 'other', 'move', 'ขึ้นบันไดแทนลิฟต์', 'เลือกขึ้น-ลงบันไดแทนการใช้ลิฟต์', 1, 'ครั้ง', 5, 'yellow', 1, false, true, 'checkbox', 3, null),
    (v_campaign_id, 'me', 'other', 'move', 'ยืนสลับนั่งทำงาน', 'ยืนทำงานสลับกับนั่ง ลดพฤติกรรมนั่งนานต่อเนื่อง', 1, 'ครั้ง', 5, 'yellow', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'move', 'Squat/Plank challenge', 'ทำ Squat หรือ Plank สั้นๆ ระหว่างวัน', 1, 'ครั้ง', 5, 'yellow', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'move', 'ปั่นจักรยาน/เดินมาทำงาน', 'เลือกปั่นจักรยานหรือเดินมาทำงานแทนขับรถ', 1, 'ครั้ง', 5, 'yellow', 1, false, true, 'checkbox', 3, null),

    -- fuel (red)
    (v_campaign_id, 'me', 'other', 'fuel', 'ผัก-ผลไม้ 5 ส่วน/วัน', 'กินผักและผลไม้ให้ได้อย่างน้อย 5 ส่วนในหนึ่งวัน', 1, 'ครั้ง', 5, 'red', 1, false, true, 'checkbox', 7, null),
    (v_campaign_id, 'me', 'other', 'fuel', 'งดน้ำหวาน/น้ำอัดลม', 'งดเครื่องดื่มรสหวาน/น้ำอัดลมทั้งวัน', 1, 'ครั้ง', 5, 'red', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'fuel', 'พกอาหารเพื่อสุขภาพมาเอง', 'เตรียม/พกอาหารเพื่อสุขภาพมาเองแทนการซื้อ', 1, 'ครั้ง', 5, 'red', 1, false, true, 'checkbox', 3, null),
    (v_campaign_id, 'me', 'other', 'fuel', 'ลดขนมหวาน/ของทอด', 'งดหรือลดขนมหวานและของทอดในมื้อว่าง', 1, 'ครั้ง', 5, 'red', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'fuel', 'กินมื้อเช้าทุกวัน', 'ไม่ข้ามมื้อเช้า', 1, 'ครั้ง', 5, 'red', 1, false, true, 'checkbox', 7, null),
    (v_campaign_id, 'me', 'other', 'fuel', 'ลองสูตรอาหารเพื่อสุขภาพใหม่', 'ลองทำ/ลองกินเมนูสุขภาพใหม่ 1 เมนู แนบรูปเป็นหลักฐาน', 1, 'ครั้ง', 18, 'red', 1, true, true, 'checkbox', 1, null),
    (v_campaign_id, 'me', 'other', 'fuel', 'คุมข้าว/แป้งต่อมื้อ', 'ควบคุมปริมาณข้าว/แป้งต่อมื้อให้พอดี (Portion control)', 1, 'ครั้ง', 5, 'red', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'fuel', 'จดบันทึกอาหารที่กิน', 'จดบันทึกอาหารที่กินในแต่ละวัน แนบรูปเป็นหลักฐาน', 1, 'ครั้ง', 10, 'red', 1, true, true, 'checkbox', 3, null),

    -- rest (pink)
    (v_campaign_id, 'me', 'other', 'rest', 'เข้านอน-ตื่นเวลาเดิม', 'เข้านอนและตื่นเวลาเดิมทุกวัน', 1, 'ครั้ง', 5, 'pink', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'rest', 'งดจอมือถือก่อนนอน 30 นาที', 'งดหน้าจอมือถือ 30 นาทีก่อนเข้านอน', 1, 'ครั้ง', 5, 'pink', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'rest', 'งีบพักสั้น 10-15 นาที', 'งีบพักสั้นช่วงกลางวัน 10-15 นาที', 1, 'ครั้ง', 5, 'pink', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'rest', 'หายใจผ่อนคลายก่อนนอน', 'ฝึกหายใจผ่อนคลายก่อนเข้านอน', 1, 'ครั้ง', 5, 'pink', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'rest', 'งดคาเฟอีนหลังบ่าย 2 โมง', 'งดชา/กาแฟ/เครื่องดื่มคาเฟอีนหลัง 14:00 น.', 1, 'ครั้ง', 5, 'pink', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'rest', 'พักสายตา 20-20-20', 'ทุก 20 นาที มองไกล 20 ฟุต เป็นเวลา 20 วินาที', 1, 'ครั้ง', 5, 'pink', 1, false, true, 'checkbox', 5, null),

    -- mind (purple)
    (v_campaign_id, 'me', 'other', 'mind', 'เขียนบันทึกขอบคุณ 3 ข้อ/วัน', 'เขียนสิ่งที่ขอบคุณ 3 ข้อในแต่ละวัน แนบรูปเป็นหลักฐาน', 1, 'ครั้ง', 15, 'purple', 1, true, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'mind', 'ฝึกสมาธิ/mindfulness', 'ฝึกสมาธิหรือ mindfulness 5-10 นาที', 1, 'ครั้ง', 5, 'purple', 1, false, true, 'checkbox', 5, null),
    (v_campaign_id, 'me', 'other', 'mind', 'ทำงานอดิเรกที่ชอบ', 'ใช้เวลาทำงานอดิเรกที่ชอบอย่างน้อย 30 นาที', 1, 'ครั้ง', 12, 'purple', 1, false, true, 'checkbox', 1, null),
    (v_campaign_id, 'me', 'other', 'mind', 'จำกัดเวลาโซเชียลมีเดีย', 'จำกัดเวลาใช้โซเชียลมีเดียไม่เกิน 1 ชม./วัน', 1, 'ครั้ง', 5, 'purple', 1, false, true, 'checkbox', 5, null),

    -- connect (orange)
    (v_campaign_id, 'me', 'other', 'connect', 'ชวนทานข้าวเที่ยงด้วยกัน', 'ชวนเพื่อนร่วมงานทานข้าวเที่ยงด้วยกัน แนบรูปเป็นหลักฐาน', 1, 'ครั้ง', 10, 'orange', 1, true, true, 'checkbox', 2, null),
    (v_campaign_id, 'me', 'other', 'connect', 'เข้าร่วมกิจกรรมหน่วยงาน', 'เข้าร่วมกิจกรรมของหน่วยงาน/แผนก แนบรูปเป็นหลักฐาน', 1, 'ครั้ง', 18, 'orange', 1, true, true, 'checkbox', 1, null),
    (v_campaign_id, 'me', 'other', 'connect', 'แบ่งปันเคล็ดลับสุขภาพให้เพื่อน', 'แบ่งปันเคล็ดลับดูแลสุขภาพให้เพื่อนร่วมงาน', 1, 'ครั้ง', 5, 'orange', 1, false, true, 'checkbox', 2, null),
    (v_campaign_id, 'me', 'other', 'connect', 'โทร/แชทครอบครัว-เพื่อนสนิท', 'โทรหรือแชทพูดคุยกับครอบครัว/เพื่อนสนิท', 1, 'ครั้ง', 12, 'orange', 1, false, true, 'checkbox', 1, null),
    (v_campaign_id, 'me', 'other', 'connect', 'คุยกลุ่มเล็กช่วงพักเบรก', 'พูดคุยกับเพื่อนร่วมงานกลุ่มเล็กช่วงพักเบรก', 1, 'ครั้ง', 5, 'orange', 1, false, true, 'checkbox', 3, null)
  on conflict do nothing;
end $$;

-- ============================================================
-- PART 3 — Recalibrate badge thresholds for the new, much larger
-- point/mission pool. UPDATE only (no delete) — every member's
-- already-unlocked badges stay unlocked exactly as before; only the
-- remaining targets move.
-- ============================================================
do $$
declare
  v_theme text;
  v_variety_max int;
  v_points_bulk int; v_points_lean int; v_points_smart int;
  v_theme_th text;
begin
  for v_theme, v_variety_max, v_points_bulk, v_points_lean, v_points_smart in
    values
      ('move', 9, 150, 400, 800),
      ('fuel', 10, 120, 350, 700),
      ('rest', 7, 80, 250, 500),
      ('mind', 10, 90, 280, 550),
      ('connect', 7, 60, 180, 350)
  loop
    update badges set target_value = 8  where family_code = v_theme||'_completions' and tier = 'bulk';
    update badges set target_value = 25 where family_code = v_theme||'_completions' and tier = 'lean';
    update badges set target_value = 50 where family_code = v_theme||'_completions' and tier = 'smart';

    update badges set target_value = v_points_bulk  where family_code = v_theme||'_points' and tier = 'bulk';
    update badges set target_value = v_points_lean  where family_code = v_theme||'_points' and tier = 'lean';
    update badges set target_value = v_points_smart where family_code = v_theme||'_points' and tier = 'smart';

    update badges set description = 'สะสมคะแนนจากภารกิจกลุ่มนี้รวม '||v_points_bulk||' คะแนน'  where family_code = v_theme||'_points' and tier = 'bulk';
    update badges set description = 'สะสมคะแนนจากภารกิจกลุ่มนี้รวม '||v_points_lean||' คะแนน'  where family_code = v_theme||'_points' and tier = 'lean';
    update badges set description = 'สะสมคะแนนจากภารกิจกลุ่มนี้รวม '||v_points_smart||' คะแนน' where family_code = v_theme||'_points' and tier = 'smart';

    -- variety: update if it already exists, insert if it doesn't
    -- (rest theme never had one — only had 1 mission before now)
    if exists (select 1 from badges where family_code = v_theme||'_variety') then
      update badges set target_value = 2 where family_code = v_theme||'_variety' and tier = 'bulk';
      update badges set target_value = least(v_variety_max - 1, greatest(2, v_variety_max/2)) where family_code = v_theme||'_variety' and tier = 'lean';
      update badges set target_value = v_variety_max where family_code = v_theme||'_variety' and tier = 'smart';
      update badges set description = 'ลองทำภารกิจในกลุ่มนี้ครบทุกแบบ ('||v_variety_max||' แบบ)' where family_code = v_theme||'_variety' and tier = 'smart';
      update badges set description = 'ลองทำภารกิจในกลุ่มนี้อย่างน้อย '||least(v_variety_max - 1, greatest(2, v_variety_max/2))||' แบบที่ต่างกัน' where family_code = v_theme||'_variety' and tier = 'lean';
    else
      v_theme_th := case v_theme
        when 'move' then 'นักเคลื่อนไหว'
        when 'fuel' then 'นักกินดี'
        when 'rest' then 'นักพักผ่อน'
        when 'mind' then 'นักดูแลใจ'
        else 'นักเชื่อมสัมพันธ์'
      end;
      insert into badges (code, family_code, tier, theme, name, description, icon, condition_field, target_value) values
        (v_theme||'_variety_bulk', v_theme||'_variety', 'bulk', v_theme, v_theme_th||' หลากหลาย 🥉', 'ลองทำภารกิจในกลุ่มนี้อย่างน้อย 2 แบบที่ต่างกัน', '🎯', v_theme||'.distinct_missions', 2),
        (v_theme||'_variety_lean', v_theme||'_variety', 'lean', v_theme, v_theme_th||' หลากหลาย 🥈', 'ลองทำภารกิจในกลุ่มนี้อย่างน้อย '||least(v_variety_max-1, greatest(2, v_variety_max/2))||' แบบที่ต่างกัน', '🎯', v_theme||'.distinct_missions', least(v_variety_max - 1, greatest(2, v_variety_max/2))),
        (v_theme||'_variety_smart', v_theme||'_variety', 'smart', v_theme, v_theme_th||' หลากหลาย 🥇', 'ลองทำภารกิจในกลุ่มนี้ครบทุกแบบ ('||v_variety_max||' แบบ)', '🎯', v_theme||'.distinct_missions', v_variety_max);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- PART 4 — admin_upsert_badge(): remove the 'rest' exclusion on
-- distinct_missions — rest theme legitimately has 7 missions and a
-- variety badge family now, same signature as before, no DROP needed.
-- ------------------------------------------------------------
create or replace function admin_upsert_badge(
  p_id uuid,
  p_family_code text,
  p_tier text,
  p_theme text,
  p_name text,
  p_description text,
  p_icon text,
  p_condition_field text,
  p_target_value numeric,
  p_icon_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_valid_fields text[] := array['streak_weeks', 'total_completions', 'total_points', 'distinct_missions'];
  v_field_suffix text;
  v_new_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_tier not in ('bulk', 'lean', 'smart') then
    raise exception 'invalid_tier';
  end if;
  if p_theme not in ('move', 'fuel', 'rest', 'mind', 'connect') then
    raise exception 'invalid_theme';
  end if;
  if p_target_value <= 0 then
    raise exception 'target_must_be_positive';
  end if;

  v_field_suffix := split_part(p_condition_field, '.', 2);
  if split_part(p_condition_field, '.', 1) <> p_theme or not (v_field_suffix = any(v_valid_fields)) then
    raise exception 'invalid_condition_field';
  end if;

  if p_id is null then
    insert into badges (code, family_code, tier, theme, name, description, icon, icon_url, condition_field, target_value)
    values (
      p_family_code || '_' || p_tier || '_' || extract(epoch from now())::bigint,
      p_family_code, p_tier, p_theme, p_name, p_description, p_icon, p_icon_url, p_condition_field, p_target_value
    )
    returning id into v_new_id;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('created', true, 'name', p_name));
  else
    update badges set
      family_code = p_family_code, tier = p_tier, theme = p_theme,
      name = p_name, description = p_description, icon = p_icon, icon_url = p_icon_url,
      condition_field = p_condition_field, target_value = p_target_value
    where id = p_id
    returning id into v_new_id;

    if v_new_id is null then
      raise exception 'badge_not_found';
    end if;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('updated', true, 'name', p_name));
  end if;

  return jsonb_build_object('success', true, 'badge_id', v_new_id);
end;
$$;
