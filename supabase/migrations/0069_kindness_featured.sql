-- ============================================================
-- Let Admin curate a set of Kindness messages to showcase on a
-- rotating display for members. The public-facing fetch only
-- returns message text + category — never sender/receiver names —
-- to stay consistent with Kindness's existing anonymity rule.
-- ============================================================
alter table kindness_logs add column if not exists is_featured boolean not null default false;

-- ------------------------------------------------------------
-- Admin: list every Kindness message (with names, since Admin
-- already has this visibility via the earlier export query) so
-- they can pick which ones to feature.
-- ------------------------------------------------------------
create or replace function admin_list_kindness_messages()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into v_result
  from (
    select
      k.id, k.created_at, k.category, k.message, k.campaign_week, k.is_featured,
      sender.full_name as from_name,
      receiver.full_name as to_name
    from kindness_logs k
    join members sender on sender.id = k.from_member_id
    join members receiver on receiver.id = k.to_member_id
    order by k.created_at desc
    limit 300
  ) row_data(id, created_at, category, message, campaign_week, is_featured, from_name, to_name);

  return v_result;
end;
$$;

grant execute on function admin_list_kindness_messages() to authenticated;

-- ------------------------------------------------------------
-- Admin: toggle whether one message is featured.
-- ------------------------------------------------------------
create or replace function admin_toggle_kindness_featured(p_kindness_id uuid, p_featured boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  update kindness_logs set is_featured = p_featured where id = p_kindness_id;
  if not found then
    raise exception 'kindness_message_not_found';
  end if;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'kindness_featured', p_kindness_id, jsonb_build_object('featured', p_featured));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_toggle_kindness_featured(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- Member-facing: fetch the rotating display list. Message text +
-- category ONLY — no from/to names — so nobody's identity is
-- exposed in the public rotation, matching Kindness's anonymity rule.
-- ------------------------------------------------------------
create or replace function get_featured_kindness_messages()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth_member_id() is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into v_result
  from (
    select id, category, message
    from kindness_logs
    where is_featured = true
    order by created_at desc
    limit 30
  ) row_data(id, category, message);

  return v_result;
end;
$$;

grant execute on function get_featured_kindness_messages() to authenticated;
