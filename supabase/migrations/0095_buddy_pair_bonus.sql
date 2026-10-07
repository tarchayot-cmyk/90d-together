-- โบนัสคู่ Buddy: ทำภารกิจ WE เดียวกัน ในวันเดียวกัน (เวลาไทย) กับสมาชิกกลุ่มเดียวกันในรอบ Buddy ปัจจุบัน
-- ได้ +5 แต้มต่อ check-in (ทั้งสองฝ่าย) นอกเพดานธีม (source = 'buddy_pair')

-- 1) อนุญาต source ใหม่
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.points_transactions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table public.points_transactions drop constraint %I', r.conname);
  end loop;
  alter table public.points_transactions
    add constraint points_transactions_source_check
    check (source = any (array['mission','kindness','admin_adjust','comeback','weekly_goal','buddy_pair']));
end $$;

-- 2) ประเภทการแจ้งเตือนใหม่
alter type notification_type add value if not exists 'buddy_pair_bonus';

-- 3) ฟังก์ชันให้โบนัส
create or replace function public.try_award_buddy_pair(p_checkin_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ci check_ins%rowtype;
  v_mission missions%rowtype;
  v_day date;
  v_round uuid;
  v_group uuid;
  v_awarded int := 0;
  v_partner record;
  v_has_partner boolean := false;
  v_msg text := '🤝 ทำกิจกรรมเดียวกับ Buddy ในวันเดียวกัน รับโบนัสคู่ +5 แต้ม';
begin
  select * into v_ci from check_ins where id = p_checkin_id;
  if v_ci.id is null or v_ci.completed_at is null then
    return 0;
  end if;
  select * into v_mission from missions where id = v_ci.mission_id;
  if v_mission.level is distinct from 'we' then
    return 0;
  end if;

  v_day := (v_ci.created_at at time zone 'Asia/Bangkok')::date;

  -- รอบ Buddy ที่ใช้อยู่ ณ เวลาที่ check-in
  select r.id into v_round
    from buddy_rounds r
    where r.campaign_id = v_mission.campaign_id and r.started_at <= v_ci.created_at
    order by r.started_at desc limit 1;
  if v_round is null then
    return 0;
  end if;

  select bm.buddy_group_id into v_group
    from buddy_members bm join buddy_groups g on g.id = bm.buddy_group_id
    where g.round_id = v_round and bm.member_id = v_ci.member_id
    limit 1;
  if v_group is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('buddypair:' || v_group::text || v_mission.id::text || v_day::text));

  -- check-in ของเพื่อนร่วมกลุ่ม ภารกิจเดียวกัน วันเดียวกัน
  for v_partner in
    select o.id as ci_id, o.member_id
    from check_ins o
    join buddy_members bm2 on bm2.buddy_group_id = v_group and bm2.member_id = o.member_id
    where o.mission_id = v_ci.mission_id
      and o.member_id <> v_ci.member_id
      and o.completed_at is not null
      and (o.created_at at time zone 'Asia/Bangkok')::date = v_day
  loop
    v_has_partner := true;
    if not exists (select 1 from points_transactions pt where pt.source = 'buddy_pair' and pt.source_ref_id = v_partner.ci_id) then
      insert into points_transactions (member_id, points, source, source_ref_id)
        values (v_partner.member_id, 5, 'buddy_pair', v_partner.ci_id);
      v_awarded := v_awarded + 1;
      begin
        perform create_notification(v_partner.member_id, 'buddy_pair_bonus', v_msg, '/home',
          jsonb_build_object('check_in_id', v_partner.ci_id));
      exception when others then null;
      end;
    end if;
  end loop;

  if v_has_partner
     and not exists (select 1 from points_transactions pt where pt.source = 'buddy_pair' and pt.source_ref_id = v_ci.id) then
    insert into points_transactions (member_id, points, source, source_ref_id)
      values (v_ci.member_id, 5, 'buddy_pair', v_ci.id);
    v_awarded := v_awarded + 1;
    begin
      perform create_notification(v_ci.member_id, 'buddy_pair_bonus', v_msg, '/home',
        jsonb_build_object('check_in_id', v_ci.id));
    exception when others then null;
    end;
  end if;

  return v_awarded;
end;
$$;
revoke all on function public.try_award_buddy_pair(uuid) from public, anon, authenticated;

-- 4) เรียกจาก hook เดิม
create or replace function public.after_checkin_completed(p_checkin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ci check_ins%rowtype;
  v_campaign campaigns%rowtype;
  v_week int;
  v_comeback boolean := false;
  v_goal boolean := false;
  v_pair int := 0;
begin
  select * into v_ci from check_ins where id = p_checkin_id;
  if v_ci.id is null then
    return null;
  end if;
  select c.* into v_campaign from campaigns c join missions m on m.campaign_id = c.id where m.id = v_ci.mission_id;
  v_week := ((v_ci.created_at at time zone 'Asia/Bangkok')::date - v_campaign.start_date) / 7 + 1;

  begin
    v_comeback := try_award_comeback(p_checkin_id);
  exception when others then
    raise warning 'comeback bonus failed for %: %', p_checkin_id, sqlerrm;
  end;

  begin
    v_pair := try_award_buddy_pair(p_checkin_id);
  exception when others then
    raise warning 'buddy pair bonus failed for %: %', p_checkin_id, sqlerrm;
  end;

  if v_week >= 1 then
    begin
      v_goal := try_award_weekly_goal(v_ci.member_id, v_campaign.id, v_week);
    exception when others then
      raise warning 'weekly goal award failed for %: %', p_checkin_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'comeback_points', case when v_comeback then 30 else 0 end,
    'weekly_goal_points', case when v_goal then 30 else 0 end,
    'buddy_pair_awards', v_pair
  );
end;
$$;
