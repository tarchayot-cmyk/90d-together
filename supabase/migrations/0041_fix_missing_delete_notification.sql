create or replace function delete_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  delete from notifications
    where id = p_notification_id and target_member_id = v_member_id;

  if not found then
    raise exception 'notification_not_found';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function delete_notification(uuid) to authenticated;

-- ตรวจสอบทันทีหลังรัน — ควรเห็น 1 แถว
select
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_notification';
