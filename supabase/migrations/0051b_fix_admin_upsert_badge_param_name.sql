-- Postgres requires an explicit DROP when a parameter's NAME
-- changes (p_level -> p_theme), even though the type (text) and
-- position are identical. CREATE OR REPLACE alone isn't enough for
-- that case — confirmed by the error when running 0051 directly.
drop function if exists admin_upsert_badge(uuid, text, text, text, text, text, text, text, numeric, text);

create or replace function admin_upsert_badge(
  p_id uuid,
  p_family_code text,
  p_tier text,
  p_theme text,
  p_name text,
  p_description text,
  p_icon text,
  p_condition_field text,
  p_target_value numeric,
  p_icon_url text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_valid_fields text[] := array['streak_weeks', 'total_completions', 'total_points', 'distinct_missions'];
  v_field_suffix text;
  v_new_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_tier not in ('bulk', 'lean', 'smart') then
    raise exception 'invalid_tier';
  end if;
  if p_theme not in ('move', 'fuel', 'rest', 'mind', 'connect') then
    raise exception 'invalid_theme';
  end if;
  if p_target_value <= 0 then
    raise exception 'target_must_be_positive';
  end if;

  v_field_suffix := split_part(p_condition_field, '.', 2);
  if split_part(p_condition_field, '.', 1) <> p_theme or not (v_field_suffix = any(v_valid_fields)) then
    raise exception 'invalid_condition_field';
  end if;
  if p_theme = 'rest' and v_field_suffix = 'distinct_missions' then
    raise exception 'invalid_condition_field';
  end if;

  if p_id is null then
    insert into badges (code, family_code, tier, theme, name, description, icon, icon_url, condition_field, target_value)
    values (
      p_family_code || '_' || p_tier || '_' || extract(epoch from now())::bigint,
      p_family_code, p_tier, p_theme, p_name, p_description, p_icon, p_icon_url, p_condition_field, p_target_value
    )
    returning id into v_new_id;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('created', true, 'name', p_name));
  else
    update badges set
      family_code = p_family_code, tier = p_tier, theme = p_theme,
      name = p_name, description = p_description, icon = p_icon, icon_url = p_icon_url,
      condition_field = p_condition_field, target_value = p_target_value
    where id = p_id
    returning id into v_new_id;

    if v_new_id is null then
      raise exception 'badge_not_found';
    end if;

    insert into audit_logs (admin_id, action, target_type, target_id, new_value)
    values (v_admin_id, 'other', 'badge', v_new_id, jsonb_build_object('updated', true, 'name', p_name));
  end if;

  return jsonb_build_object('success', true, 'badge_id', v_new_id);
end;
$$;

grant execute on function admin_upsert_badge(uuid, text, text, text, text, text, text, text, numeric, text) to authenticated;
