-- ============================================================
-- Fix: assign_groups_randomly() failed with
--   42804: column "action" is of type audit_action but expression is of type text
-- The CASE expression choosing 'assign_buddy'/'assign_squad' needs an
-- explicit ::audit_action cast — Postgres won't infer it automatically
-- inside an INSERT ... VALUES (...) expression. Everything else in
-- the function is unchanged from 0003_sprint3_buddy_squad_kindness.sql.
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
    (case when p_kind = 'buddy' then 'assign_buddy' else 'assign_squad' end)::audit_action,
    'campaign', p_campaign_id, jsonb_build_object('groups_created', v_group_num)
  );

  return jsonb_build_object('success', true, 'groups_created', v_group_num);
end;
$$;

grant execute on function assign_groups_randomly(uuid, text, int, int) to authenticated;
