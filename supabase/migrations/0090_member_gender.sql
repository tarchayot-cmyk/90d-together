-- Optional gender (used only by the admin Buddy pairing) + willingness to be paired across genders.
alter table public.members add column if not exists gender text;
alter table public.members add column if not exists allow_cross_gender_buddy boolean not null default false;
alter table public.members drop constraint if exists members_gender_check;
alter table public.members add constraint members_gender_check check (gender is null or gender in ('male','female'));

create or replace function public.update_my_gender(p_gender text, p_allow_cross boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_member_id uuid;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then raise exception 'not_authenticated'; end if;
  if p_gender is not null and p_gender not in ('male','female') then raise exception 'invalid_gender'; end if;
  update members set gender = p_gender, allow_cross_gender_buddy = coalesce(p_allow_cross, false)
    where id = v_member_id;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_set_member_gender(p_member_id uuid, p_gender text, p_allow_cross boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_admin uuid; v_old jsonb;
begin
  if not is_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  v_admin := auth_member_id();
  if p_gender is not null and p_gender not in ('male','female') then raise exception 'invalid_gender'; end if;
  select jsonb_build_object('gender', gender, 'allow_cross', allow_cross_gender_buddy) into v_old
    from members where id = p_member_id;
  if v_old is null then raise exception 'member_not_found'; end if;
  update members set gender = p_gender, allow_cross_gender_buddy = coalesce(p_allow_cross, false)
    where id = p_member_id;
  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (v_admin, 'other', 'member', p_member_id, v_old,
          jsonb_build_object('gender', p_gender, 'allow_cross', coalesce(p_allow_cross, false)));
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.update_my_gender(text, boolean) to authenticated;
grant execute on function public.admin_set_member_gender(uuid, text, boolean) to authenticated;
