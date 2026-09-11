-- ============================================================
-- 90 Days Growing Together — Admin CRUD Migration
-- Missions / Campaign / Member active-toggle, all is_admin()-gated
-- and all audited (reuses the audit_action values already defined
-- in Sprint 1: 'edit_mission', 'deactivate_member', 'other').
--
-- Note: missions/campaigns/members already have RLS policies letting
-- an admin write to them directly (see 0001_sprint1_core.sql). These
-- RPCs exist on top of that purely to guarantee an audit_logs entry
-- for every change — a direct table write from the client would
-- still succeed under RLS, but would leave no paper trail.
--
-- Depends on Sprints 1-7. Run once, top to bottom, in the SQL Editor.
-- ============================================================

-- ============================================================
-- 1. admin_upsert_mission()
-- p_mission_id = null -> create; otherwise -> update that mission.
-- ============================================================
create or replace function admin_upsert_mission(
  p_mission_id uuid,
  p_campaign_id uuid,
  p_level campaign_level,
  p_category mission_category,
  p_name text,
  p_description text,
  p_target_value numeric,
  p_unit text,
  p_points int,
  p_sticker_color sticker_color,
  p_sticker_amount int,
  p_requires_proof boolean,
  p_is_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_value jsonb;
  v_new_mission missions%rowtype;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_target_value <= 0 then
    raise exception 'target_value_must_be_positive';
  end if;

  if p_mission_id is null then
    insert into missions (
      campaign_id, level, category, name, description, target_value, unit,
      points, sticker_color, sticker_amount, requires_proof, is_active
    ) values (
      p_campaign_id, p_level, p_category, p_name, p_description, p_target_value, p_unit,
      p_points, p_sticker_color, p_sticker_amount, p_requires_proof, p_is_active
    )
    returning * into v_new_mission;

    insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
    values (v_admin_id, 'edit_mission', 'mission', v_new_mission.id, null, to_jsonb(v_new_mission));
  else
    select to_jsonb(m) into v_old_value from missions m where m.id = p_mission_id;
    if v_old_value is null then
      raise exception 'mission_not_found';
    end if;

    update missions set
      campaign_id = p_campaign_id, level = p_level, category = p_category,
      name = p_name, description = p_description, target_value = p_target_value, unit = p_unit,
      points = p_points, sticker_color = p_sticker_color, sticker_amount = p_sticker_amount,
      requires_proof = p_requires_proof, is_active = p_is_active
    where id = p_mission_id
    returning * into v_new_mission;

    insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
    values (v_admin_id, 'edit_mission', 'mission', p_mission_id, v_old_value, to_jsonb(v_new_mission));
  end if;

  return jsonb_build_object('success', true, 'mission_id', v_new_mission.id);
end;
$$;

grant execute on function admin_upsert_mission(
  uuid, uuid, campaign_level, mission_category, text, text, numeric, text,
  int, sticker_color, int, boolean, boolean
) to authenticated;

-- ============================================================
-- 2. admin_upsert_campaign()
-- p_campaign_id = null -> create a new campaign; otherwise -> update.
-- ============================================================
create or replace function admin_upsert_campaign(
  p_campaign_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_is_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_value jsonb;
  v_new_campaign campaigns%rowtype;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  if p_end_date < p_start_date then
    raise exception 'end_date_before_start_date';
  end if;

  if p_campaign_id is null then
    insert into campaigns (name, start_date, end_date, is_active)
    values (p_name, p_start_date, p_end_date, p_is_active)
    returning * into v_new_campaign;

    insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
    values (v_admin_id, 'other', 'campaign', v_new_campaign.id, null, to_jsonb(v_new_campaign));
  else
    select to_jsonb(c) into v_old_value from campaigns c where c.id = p_campaign_id;
    if v_old_value is null then
      raise exception 'campaign_not_found';
    end if;

    update campaigns set
      name = p_name, start_date = p_start_date, end_date = p_end_date, is_active = p_is_active
    where id = p_campaign_id
    returning * into v_new_campaign;

    insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
    values (v_admin_id, 'other', 'campaign', p_campaign_id, v_old_value, to_jsonb(v_new_campaign));
  end if;

  return jsonb_build_object('success', true, 'campaign_id', v_new_campaign.id);
end;
$$;

grant execute on function admin_upsert_campaign(uuid, text, date, date, boolean) to authenticated;

-- ============================================================
-- 3. admin_set_member_active()  — activate/deactivate, always audited
-- ============================================================
create or replace function admin_set_member_active(
  p_member_id uuid,
  p_is_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_old_active boolean;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select is_active into v_old_active from members where id = p_member_id;
  if v_old_active is null then
    raise exception 'member_not_found';
  end if;

  update members set is_active = p_is_active where id = p_member_id;

  insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
  values (
    v_admin_id,
    case when p_is_active then 'other' else 'deactivate_member' end,
    'member', p_member_id,
    jsonb_build_object('is_active', v_old_active),
    jsonb_build_object('is_active', p_is_active)
  );

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_set_member_active(uuid, boolean) to authenticated;
