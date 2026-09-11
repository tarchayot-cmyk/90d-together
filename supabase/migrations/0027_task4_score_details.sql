-- ============================================================
-- TASK 4 — Admin: Score Detail View
-- Read-only feature. The only write-side change is linking
-- admin_adjust points_transactions rows to their audit_logs entry
-- so the "reason" can be displayed — the points math itself
-- (v_old_total, v_new_total, the insert amount) is byte-for-byte
-- identical to the live version in 0005.
-- ============================================================

-- ------------------------------------------------------------
-- 1. admin_adjust_points() — now sets source_ref_id so this
-- transaction can be traced back to the audit_logs reason. Nothing
-- about the point calculation changes.
-- ------------------------------------------------------------
create or replace function admin_adjust_points(
  p_member_id uuid,
  p_points int,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_total numeric;
  v_new_total numeric;
  v_txn_id uuid;
  v_audit_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_admin_id := auth_member_id();

  if not exists (select 1 from members where id = p_member_id) then
    raise exception 'member_not_found';
  end if;

  select coalesce(sum(points), 0) into v_old_total
    from points_transactions where member_id = p_member_id;

  insert into points_transactions (member_id, points, source, source_ref_id)
  values (p_member_id, p_points, 'admin_adjust', null)
  returning id into v_txn_id;

  v_new_total := v_old_total + p_points;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id, 'adjust_points', 'member', p_member_id,
    jsonb_build_object('points_total', v_old_total),
    jsonb_build_object('points_total', v_new_total, 'delta', p_points, 'reason', p_reason)
  )
  returning id into v_audit_id;

  -- NEW in Task 4: link the transaction to its audit entry so the
  -- reason can be looked up later — purely a traceability addition.
  update points_transactions set source_ref_id = v_audit_id where id = v_txn_id;

  return jsonb_build_object('success', true, 'old_total', v_old_total, 'new_total', v_new_total);
end;
$$;

grant execute on function admin_adjust_points(uuid, int, text) to authenticated;

-- ------------------------------------------------------------
-- 2. get_member_score_details() — itemized breakdown for one member
-- ------------------------------------------------------------
create or replace function get_member_score_details(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', pt.id,
        'created_at', pt.created_at,
        'points', pt.points,
        'source', pt.source,
        'activity', coalesce(
          m.name,
          case when pt.source = 'kindness' then 'Kindness' end,
          'ปรับคะแนนโดย Admin'
        ),
        'detail', case
          when pt.source = 'mission' then
            nullif(ci.note, '') 
          when pt.source = 'kindness' then
            'ประเภท: ' || kl.category::text || coalesce(' — "' || kl.message || '"', '')
          when pt.source = 'admin_adjust' then
            coalesce(al.new_value ->> 'reason', '-')
          else null
        end,
        'proof_status', case when pt.source = 'mission' then ci.proof_status else null end,
        'admin_name', case when pt.source = 'admin_adjust' then adm.full_name else null end
      ) as row_data
      from points_transactions pt
      left join check_ins ci on pt.source = 'mission' and ci.id = pt.source_ref_id
      left join missions m on ci.mission_id = m.id
      left join kindness_logs kl on pt.source = 'kindness' and kl.id = pt.source_ref_id
      left join audit_logs al on pt.source = 'admin_adjust' and al.id = pt.source_ref_id
      left join members adm on al.admin_id = adm.id
      where pt.member_id = p_member_id
    ) sub
  );
end;
$$;

grant execute on function get_member_score_details(uuid) to authenticated;
