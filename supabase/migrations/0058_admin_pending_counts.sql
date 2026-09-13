-- ============================================================
-- Consolidated pending-item counts for the Admin Dashboard's quick
-- link buttons (Check-in / กิจกรรมที่เสนอ / ข้อเสนอแนะ).
-- ============================================================
create or replace function admin_get_pending_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending_checkins int;
  v_pending_proposals int;
  v_open_feedback int;
begin
  if not exists (select 1 from members where id = auth_member_id() and role in ('admin', 'super_admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select count(*) into v_pending_checkins from check_ins where proof_status = 'pending';
  select count(*) into v_pending_proposals from activity_proposals where status = 'pending';
  select count(*) into v_open_feedback from feedback_messages where status = 'open';

  return jsonb_build_object(
    'pending_checkins', v_pending_checkins,
    'pending_proposals', v_pending_proposals,
    'open_feedback', v_open_feedback
  );
end;
$$;

grant execute on function admin_get_pending_counts() to authenticated;
