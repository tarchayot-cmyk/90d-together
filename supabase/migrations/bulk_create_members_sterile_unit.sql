-- ============================================================
-- Bulk-create 42 members from the uploaded staff list:
--   - หน่วยผลิตยาปราศจากเชื้อ งานผลิตยา (29 คน)
--   - เจ้าหน้าที่ห้องผลิตยาทั่วไป (13 คน)
-- รหัส M01–M42, PIN 1234 ทุกคน, role = participant ทุกคน
-- ชื่อเล่น/หน่วย/แผนก เว้นว่างตามที่ระบุ
--
-- ใช้ logic เดียวกับ admin_create_member() ทุกขั้นตอน (สร้าง
-- auth.users + members คู่กัน) แต่ข้ามเช็ค is_admin() เพราะรันตรงจาก
-- SQL Editor ซึ่งมีสิทธิ์สูงอยู่แล้ว — ปลอดภัยที่จะรันซ้ำได้
-- (ข้ามรหัสที่มีอยู่แล้วโดยอัตโนมัติ)
-- ============================================================
do $$
declare
  v_names text[] := array[
    'ภญ.ชุติมา ไชยวุฒิ',
    'ภก.กรุงไกร ปัญญาบุญญฤทธิ์',
    'ภญ.จันทนี ถนอมศักดิ์เจริญ',
    'ภญ.เกษนีย์ ศรีจอมทอง',
    'ภญ.พัสตราภรณ์ รัตนสุทธดา',
    'ภญ.ปาณิศา เอี่ยมศรี',
    'ภญ.รุ่งรวิน อนุนิมิตรานนท์',
    'ภญ.ศิริธรรม์ ขันธรรม',
    'ภก.ชญตว์ เพชรคนชม',
    'ภญ.ธัญลักษณ์ วังตา',
    'ภญ.นิชาภรณ์ วงศ์นันตา',
    'ภญ.พรทิวา ตุ้ยปัญญา',
    'ภญ.ชนิษฐา ไชยราชา',
    'นางสาวสุรีรัตน์ กองตา',
    'นางสาวจุฬาลักษณ์ คำมูล',
    'นางสาวจันทร์ชุรี วงค์ษา',
    'นางสาวมยุรา มาเยอะ',
    'นางสาวจุฑามาศ ประกอบศิลป์',
    'นางสาววราพร มณีดวงฤทธิ์',
    'นางสาวชุติมา ตูมจา',
    'นางสาวสายสุดา อินต๊ะกัน',
    'นางสาวเข็มอักษร คิดอ่าน',
    'นางสาวนฤมล พุทธิมา',
    'นางสาวพาณิภัค ตาวารัตน์',
    'นายสุรพล ไทยใหม่',
    'นายชาตรี นันต๊ะราช',
    'นายธนานันท์ นันทวี',
    'นายจักรินทร์ พรมไชย',
    'นางสาวสุพัตรา เมามูล',
    'ภญ.จิรัฐิ์ติกาล เรือนใจแก่น',
    'ภญ.จิรพร เลิศสุวรรณ',
    'ภญ.ปวีณา สารีอินทร์',
    'ภก.พรรษพล รัตน์สุคนธ์เลิศ',
    'ภญ.วิสสุตา กัยวิกัยโกศล',
    'นายเจษฎาพร ชำนาญ',
    'นางวาสนา สารขาว',
    'นางสาวปริณดา พุทธวงค์',
    'นายปิยราช ปัญญาฟู',
    'นายจิรายุ ลิ้มประเสริฐ',
    'นางสาวณิชนันทน์ ขันขาว',
    'นายธีระยุทธ ศรีสง่า',
    'นายธรรมรัตน์ ดวงพันธ์'
  ];
  v_code text;
  v_name text;
  v_email text;
  v_auth_id uuid;
  v_created int := 0;
  v_skipped int := 0;
  i int;
begin
  for i in 1 .. array_length(v_names, 1) loop
    v_code := 'M' || lpad(i::text, 2, '0');
    v_name := v_names[i];

    if exists (select 1 from members where employee_code = v_code) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_auth_id := gen_random_uuid();
    v_email := lower(trim(v_code)) || '@employee.growtogether.local';

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      v_auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, crypt('1234', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"employee_code","providers":["employee_code"]}'::jsonb,
      jsonb_build_object('employee_code', v_code, 'full_name', v_name),
      '', '', '', '', '', '', '', ''
    );

    insert into members (auth_user_id, employee_code, full_name, nickname, unit, department, role, is_active)
    values (v_auth_id, v_code, v_name, null, null, null, 'participant', true);

    v_created := v_created + 1;
  end loop;

  raise notice 'สร้างสำเร็จ % คน, ข้ามไป % คน (รหัสซ้ำอยู่แล้ว)', v_created, v_skipped;
end $$;

-- ตรวจผลลัพธ์
select employee_code, full_name, role, is_active
from members
where employee_code ~ '^M[0-9]{2}$'
order by employee_code;
