-- ============================================================
-- 90 Days Growing Together — Sprint 3 Migration
-- Buddy / Squad tables + give_kindness() + team progress RPCs
-- Depends on Sprint 1 & 2 (auth_member_id(), is_admin(), campaigns,
-- members, missions, check_ins, points_transactions, stickers,
-- kindness_logs already exist).
-- Run once, top to bottom, in the Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 0. TABLES — buddy_groups / buddy_members / squads / squad_members
-- (not created in Sprint 1, needed from here on)
-- ------------------------------------------------------------
create table buddy_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table buddy_members (
  buddy_group_id uuid not null references buddy_groups (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (buddy_group_id, member_id)
);

create table squads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table squad_members (
  squad_id uuid not null references squads (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (squad_id, member_id)
);

create index idx_buddy_members_member on buddy_members (member_id);
create index idx_squad_members_member on squad_members (member_id);

alter table buddy_groups enable row level security;
alter table buddy_members enable row level security;
alter table squads enable row level security;
alter table squad_members enable row level security;

create policy buddy_groups_select on buddy_groups for select using (auth.uid() is not null);
create policy buddy_groups_admin_write on buddy_groups for all using (is_admin()) with check (is_admin());
create policy buddy_members_select on buddy_members for select using (auth.uid() is not null);
create policy buddy_members_admin_write on buddy_members for all using (is_admin()) with check (is_admin());
create policy squads_select on squads for select using (auth.uid() is not null);
create policy squads_admin_write on squads for all using (is_admin()) with check (is_admin());
create policy squad_members_select on squad_members for select using (auth.uid() is not null);
create policy squad_members_admin_write on squad_members for all using (is_admin()) with check (is_admin());

-- ============================================================
-- 1. give_kindness()  — spec sections 14-15
-- Anti-abuse: no self-send, max 1 kindness per (sender, recipient)
-- pair per week, recipient caps at 3 rewarded kindness per week.
-- ============================================================
create or replace function give_kindness(
  p_to_member_id uuid,
  p_category kindness_category,
  p_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_member_id uuid;
  v_campaign campaigns%rowtype;
  v_week int;
  v_pair_count int;
  v_recipient_count int;
  v_kindness_id uuid;
begin
  v_from_member_id := auth_member_id();
  if v_from_member_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_to_member_id = v_from_member_id then
    raise exception 'cannot_send_to_self';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    raise exception 'campaign_not_active';
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  -- Same pair (this sender -> this recipient), max 1 per week.
  select count(*) into v_pair_count from kindness_logs
    where from_member_id = v_from_member_id
      and to_member_id = p_to_member_id
      and campaign_week = v_week;
  if v_pair_count >= 1 then
    raise exception 'pair_limit_reached';
  end if;

  -- Recipient caps at 3 rewarded kindness per week (from anyone).
  select count(*) into v_recipient_count from kindness_logs
    where to_member_id = p_to_member_id
      and campaign_week = v_week;
  if v_recipient_count >= 3 then
    raise exception 'recipient_limit_reached';
  end if;

  insert into kindness_logs (campaign_id, from_member_id, to_member_id, category, message, campaign_week)
  values (v_campaign.id, v_from_member_id, p_to_member_id, p_category, p_message, v_week)
  returning id into v_kindness_id;

  -- Reward goes to the recipient only — the giver doesn't need points
  -- for Kindness to stay meaningful (spec section 14).
  insert into points_transactions (member_id, points, source, source_ref_id)
  values (p_to_member_id, 10, 'kindness', v_kindness_id);

  insert into stickers (member_id, color, amount, source, source_ref_id)
  values (p_to_member_id, 'rainbow', 1, 'kindness', v_kindness_id);

  return jsonb_build_object('success', true, 'message', 'ส่งความห่วงใยสำเร็จ!');
end;
$$;

grant execute on function give_kindness(uuid, kindness_category, text) to authenticated;

-- ============================================================
-- 2. get_buddy_progress() / get_squad_progress()
-- Sums this week's check-in values from every member of the
-- caller's own group against a team target. Returns a per-member
-- breakdown in group order (never sorted by "who did least" —
-- spec section 17) plus the total and remaining amount, which the
-- UI should headline instead of any individual's number.
-- ============================================================
create or replace function get_buddy_progress(p_target numeric default 80000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_campaign campaigns%rowtype;
  v_week int;
  v_total numeric := 0;
  v_members jsonb;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select bg.id, bg.name into v_group_id, v_group_name
  from buddy_members bm
  join buddy_groups bg on bg.id = bm.buddy_group_id
  where bm.member_id = v_member_id
  limit 1;

  if v_group_id is null then
    return jsonb_build_object('has_group', false);
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object(
      'has_group', true, 'group_name', v_group_name,
      'target', p_target, 'total', 0, 'remaining', p_target, 'members', '[]'::jsonb
    );
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select coalesce(sum(ci.value), 0) into v_total
  from check_ins ci
  join missions m on m.id = ci.mission_id
  join buddy_members bm on bm.member_id = ci.member_id and bm.buddy_group_id = v_group_id
  where m.category = 'buddy_walk' and ci.campaign_week = v_week;

  select coalesce(jsonb_agg(jsonb_build_object('name', mem.full_name, 'value', coalesce(row_val.value, 0))), '[]'::jsonb)
  into v_members
  from buddy_members bm
  join members mem on mem.id = bm.member_id
  left join lateral (
    select ci.value from check_ins ci
    join missions m on m.id = ci.mission_id
    where ci.member_id = bm.member_id and m.category = 'buddy_walk' and ci.campaign_week = v_week
    limit 1
  ) row_val on true
  where bm.buddy_group_id = v_group_id;

  return jsonb_build_object(
    'has_group', true,
    'group_name', v_group_name,
    'target', p_target,
    'total', v_total,
    'remaining', greatest(p_target - v_total, 0),
    'members', v_members
  );
end;
$$;

create or replace function get_squad_progress(p_target numeric default 100000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_squad_id uuid;
  v_squad_name text;
  v_campaign campaigns%rowtype;
  v_week int;
  v_total numeric := 0;
  v_members jsonb;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select s.id, s.name into v_squad_id, v_squad_name
  from squad_members sm
  join squads s on s.id = sm.squad_id
  where sm.member_id = v_member_id
  limit 1;

  if v_squad_id is null then
    return jsonb_build_object('has_group', false);
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object(
      'has_group', true, 'group_name', v_squad_name,
      'target', p_target, 'total', 0, 'remaining', p_target, 'members', '[]'::jsonb
    );
  end if;

  v_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);

  select coalesce(sum(ci.value), 0) into v_total
  from check_ins ci
  join missions m on m.id = ci.mission_id
  join squad_members sm on sm.member_id = ci.member_id and sm.squad_id = v_squad_id
  where m.category = 'big_step' and ci.campaign_week = v_week;

  select coalesce(jsonb_agg(jsonb_build_object('name', mem.full_name, 'value', coalesce(row_val.value, 0))), '[]'::jsonb)
  into v_members
  from squad_members sm
  join members mem on mem.id = sm.member_id
  left join lateral (
    select ci.value from check_ins ci
    join missions m on m.id = ci.mission_id
    where ci.member_id = sm.member_id and m.category = 'big_step' and ci.campaign_week = v_week
    limit 1
  ) row_val on true
  where sm.squad_id = v_squad_id;

  return jsonb_build_object(
    'has_group', true,
    'group_name', v_squad_name,
    'target', p_target,
    'total', v_total,
    'remaining', greatest(p_target - v_total, 0),
    'members', v_members
  );
end;
$$;

grant execute on function get_buddy_progress(numeric) to authenticated;
grant execute on function get_squad_progress(numeric) to authenticated;

-- ============================================================
-- 3. BONUS — assign_groups_randomly()
-- Matches your earlier decision (V1 = automatic random assignment).
-- Admin-only. Run once per campaign when entering the WE / US phase.
-- kind: 'buddy' (size 2-3) or 'squad' (size 4-6).
-- ============================================================
create or replace function assign_groups_randomly(
  p_campaign_id uuid,
  p_kind text,
  p_min_size int,
  p_max_size int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_ids uuid[];
  v_total int;
  v_i int := 1;
  v_group_num int := 0;
  v_group_size int;
  v_group_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized';
  end if;
  if p_kind not in ('buddy', 'squad') then
    raise exception 'invalid_kind';
  end if;

  select array_agg(id order by random()) into v_member_ids
    from members where is_active = true and role = 'participant';
  v_total := coalesce(array_length(v_member_ids, 1), 0);

  while v_i <= v_total loop
    v_group_num := v_group_num + 1;
    v_group_size := least(p_max_size, v_total - v_i + 1);
    if (v_total - v_i + 1) - v_group_size < p_min_size and (v_total - v_i + 1) > v_group_size then
      v_group_size := v_total - v_i + 1;
    end if;

    if p_kind = 'buddy' then
      insert into buddy_groups (campaign_id, name)
        values (p_campaign_id, 'Buddy Group ' || v_group_num) returning id into v_group_id;
    else
      insert into squads (campaign_id, name)
        values (p_campaign_id, 'Squad ' || v_group_num) returning id into v_group_id;
    end if;

    for j in 0..(v_group_size - 1) loop
      if p_kind = 'buddy' then
        insert into buddy_members (buddy_group_id, member_id) values (v_group_id, v_member_ids[v_i + j]);
      else
        insert into squad_members (squad_id, member_id) values (v_group_id, v_member_ids[v_i + j]);
      end if;
    end loop;

    v_i := v_i + v_group_size;
  end loop;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (
    (select id from members where auth_user_id = auth.uid()),
    case when p_kind = 'buddy' then 'assign_buddy' else 'assign_squad' end,
    'campaign', p_campaign_id, jsonb_build_object('groups_created', v_group_num)
  );

  return jsonb_build_object('success', true, 'groups_created', v_group_num);
end;
$$;

grant execute on function assign_groups_randomly(uuid, text, int, int) to authenticated;

-- ============================================================
-- 4. OPTIONAL test seed — Buddy Walk (WE) + Big Step Challenge (US)
-- missions, so get_buddy_progress()/get_squad_progress() have real
-- check-in data to sum once members start submitting. Individual
-- reward here (+20 pts / +2 stickers, per spec section 12-13) fires
-- through the existing complete_mission() the same way ME missions
-- do — the team target above is tracked separately by the two
-- progress functions, not by missions.target_value.
-- ============================================================
do $$
declare
  v_campaign_id uuid;
begin
  select id into v_campaign_id from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign_id is not null then
    insert into missions (
      campaign_id, level, category, name, description,
      target_value, unit, points, sticker_color, sticker_amount, requires_proof
    ) values
      (v_campaign_id, 'we', 'buddy_walk', 'Buddy Walk',
       'สะสม steps ของทีม 80,000/สัปดาห์ (บันทึก steps ของตัวเองรายสัปดาห์)',
       1, 'steps', 20, 'yellow', 2, false),
      (v_campaign_id, 'us', 'big_step', 'Big Step Challenge',
       'สะสม steps ของ Squad 100,000/สัปดาห์ (บันทึก steps ของตัวเองรายสัปดาห์)',
       1, 'steps', 30, 'yellow', 3, false)
    on conflict do nothing;
  end if;
end $$;
