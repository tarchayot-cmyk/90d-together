-- ============================================================
-- Checkbox-style missions: for activities like "Know Me" (weigh
-- yourself once a week) where there's no meaningful quantity to
-- type — just "did you do it or not". Additive column, defaults to
-- 'numeric' so every existing mission behaves exactly as before.
--
-- complete_mission() itself needs NO change — it already just checks
-- p_value >= target_value. For checkbox missions, the frontend sends
-- p_value = target_value automatically when the member taps the
-- confirm button, instead of asking them to type a number that's
-- always the same value anyway.
-- ============================================================
alter table missions add column if not exists input_type text not null default 'numeric' check (input_type in ('numeric', 'checkbox'));

-- Signature changes (13 params -> 14), so the old version must be
-- dropped first — CREATE OR REPLACE cannot change a function's
-- argument list.
drop function if exists admin_upsert_mission(uuid, uuid, campaign_level, mission_category, text, text, numeric, text, int, sticker_color, int, boolean, boolean);

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
  p_is_active boolean,
  p_input_type text default 'numeric'
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
  if p_input_type not in ('numeric', 'checkbox') then
    raise exception 'invalid_input_type';
  end if;

  if p_mission_id is null then
    insert into missions (
      campaign_id, level, category, name, description, target_value, unit,
      points, sticker_color, sticker_amount, requires_proof, is_active, input_type
    ) values (
      p_campaign_id, p_level, p_category, p_name, p_description, p_target_value, p_unit,
      p_points, p_sticker_color, p_sticker_amount, p_requires_proof, p_is_active, p_input_type
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
      requires_proof = p_requires_proof, is_active = p_is_active, input_type = p_input_type
    where id = p_mission_id
    returning * into v_new_mission;

    insert into audit_logs (admin_id, action, target_type, target_id, old_value, new_value)
    values (v_admin_id, 'edit_mission', 'mission', p_mission_id, v_old_value, to_jsonb(v_new_mission));
  end if;

  return jsonb_build_object('success', true, 'mission_id', v_new_mission.id);
end;
$$;

grant execute on function admin_upsert_mission(uuid, uuid, campaign_level, mission_category, text, text, numeric, text, int, sticker_color, int, boolean, boolean, text) to authenticated;
