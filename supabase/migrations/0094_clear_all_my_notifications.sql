-- ปุ่มลบการแจ้งเตือนทั้งหมดของตัวเอง
create or replace function public.clear_all_my_notifications()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member_id uuid;
  v_count int;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;
  delete from notifications where target_member_id = v_member_id;
  get diagnostics v_count = row_count;
  return jsonb_build_object('success', true, 'cleared', v_count);
end;
$$;
revoke all on function public.clear_all_my_notifications() from public, anon;
grant execute on function public.clear_all_my_notifications() to authenticated;
