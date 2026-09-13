-- Adds employee_code to the 'me' (individual) leaderboard branch so
-- the ranking page's search bar can filter by it. WE/US branches
-- (team rankings) are unchanged — they don't have an employee_code
-- concept since they group multiple people.
create or replace function get_leaderboard(p_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_type not in ('me', 'we', 'us') then
    raise exception 'invalid_type';
  end if;

  if p_type = 'me' then
    select coalesce(jsonb_agg(row_data order by (row_data->>'total_points')::numeric desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'id', m.id,
        'name', m.full_name,
        'employee_code', m.employee_code,
        'department', m.department,
        'avatar_url', m.avatar_url,
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from members m
      left join points_transactions pt on pt.member_id = m.id
      where m.role = 'participant' and m.is_active = true
      group by m.id, m.full_name, m.employee_code, m.department, m.avatar_url
    ) sub;

  elsif p_type = 'we' then
    select coalesce(jsonb_agg(row_data order by (row_data->>'total_points')::numeric desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'id', bg.id,
        'name', bg.name,
        'member_count', count(distinct bm.member_id),
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from buddy_groups bg
      left join buddy_members bm on bm.buddy_group_id = bg.id
      left join points_transactions pt on pt.member_id = bm.member_id
      group by bg.id, bg.name
    ) sub;

  else -- 'us'
    select coalesce(jsonb_agg(row_data order by (row_data->>'total_points')::numeric desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'member_count', count(distinct sm.member_id),
        'total_points', coalesce(sum(pt.points), 0)
      ) as row_data
      from squads s
      left join squad_members sm on sm.squad_id = s.id
      left join points_transactions pt on pt.member_id = sm.member_id
      group by s.id, s.name
    ) sub;
  end if;

  return jsonb_build_object('type', p_type, 'rankings', v_result);
end;
$$;
