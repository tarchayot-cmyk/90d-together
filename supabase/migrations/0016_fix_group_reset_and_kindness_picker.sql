-- ============================================================
-- Fixes: group reassignment leaves stale duplicate memberships,
-- and the Kindness colleague picker can't see anyone (correctly
-- blocked by members RLS, which only allows self-or-admin reads).
-- ============================================================

-- ============================================================
-- 1. assign_groups_randomly() — clear old groups for this campaign
-- before creating new ones, so re-running the button is a clean
-- reset instead of piling up duplicate memberships. Deleting
-- buddy_groups/squads cascades to buddy_members/squad_members
-- automatically (on delete cascade, set up in 0003).
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

  -- Reset: wipe this campaign's existing groups of this kind first.
  if p_kind = 'buddy' then
    delete from buddy_groups where campaign_id = p_campaign_id;
  else
    delete from squads where campaign_id = p_campaign_id;
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
    (case when p_kind = 'buddy' then 'assign_buddy' else 'assign_squad' end)::audit_action,
    'campaign', p_campaign_id, jsonb_build_object('groups_created', v_group_num, 'reset_first', true)
  );

  return jsonb_build_object('success', true, 'groups_created', v_group_num);
end;
$$;

grant execute on function assign_groups_randomly(uuid, text, int, int) to authenticated;

-- One-time cleanup: collapse any duplicate memberships that already
-- exist from before this fix (keeps each member's most-recently-
-- created group only, per kind).
delete from buddy_members bm
where exists (
  select 1 from buddy_members bm2
  join buddy_groups bg1 on bg1.id = bm.buddy_group_id
  join buddy_groups bg2 on bg2.id = bm2.buddy_group_id
  where bm2.member_id = bm.member_id and bg2.created_at > bg1.created_at
);
delete from buddy_groups where id not in (select distinct buddy_group_id from buddy_members);

delete from squad_members sm
where exists (
  select 1 from squad_members sm2
  join squads s1 on s1.id = sm.squad_id
  join squads s2 on s2.id = sm2.squad_id
  where sm2.member_id = sm.member_id and s2.created_at > s1.created_at
);
delete from squads where id not in (select distinct squad_id from squad_members);

-- ============================================================
-- 2. list_colleagues() — safe, minimal read for the Kindness
-- picker. Bypasses the (intentionally strict) members RLS via
-- SECURITY DEFINER, but only ever returns name + department,
-- never employee_code/role/auth_user_id/is_active.
-- ============================================================
create or replace function list_colleagues()
returns table (id uuid, full_name text, department text)
language sql
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.department
  from members m
  where m.is_active = true
    and m.role = 'participant'
    and m.auth_user_id <> auth.uid()
  order by m.full_name;
$$;

grant execute on function list_colleagues() to authenticated;
