-- ============================================================
-- TASK 14 — E2E QA fix #1 (Scenario I: "Admin views badge
-- information" — get_badge_progress() had no way to target another
-- member; it was hardcoded to auth_member_id() only).
--
-- Signature changes from () to (uuid default null), so the old
-- zero-arg version must be dropped first. Existing frontend calls
-- with no arguments (src/app/(main)/profile/page.tsx) are
-- unaffected — PostgREST fills in the default (null), which
-- resolves to the caller's own id exactly as before.
-- ============================================================
drop function if exists get_badge_progress();

create or replace function get_badge_progress(p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_target_id uuid;
  v_measurements jsonb;
  v_campaign_day numeric;
begin
  v_caller_id := auth_member_id();
  if v_caller_id is null then
    raise exception 'not_authenticated';
  end if;

  v_target_id := coalesce(p_member_id, v_caller_id);

  -- Viewing someone else's badges requires admin.
  if v_target_id <> v_caller_id and not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_measurements := get_badge_measurements(v_target_id);

  select greatest(0, current_date - c.start_date + 1) into v_campaign_day
  from campaigns c where c.is_active = true order by c.start_date desc limit 1;
  v_campaign_day := coalesce(v_campaign_day, 0);

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', b.code,
          'name', b.name,
          'description', b.description,
          'icon', b.icon,
          'unlocked', (mb.member_id is not null),
          'unlocked_at', mb.unlocked_at,
          'current_value', case
            when b.condition_field = 'squad_success' then
              case when coalesce((v_measurements ->> 'squad_success')::boolean, false) then 1 else 0 end
            when b.condition_field = 'campaign_finished' then
              least(v_campaign_day, 90)
            else
              least(coalesce((v_measurements ->> b.condition_field)::numeric, 0), b.target_value)
          end,
          'target_value', case
            when b.condition_field = 'campaign_finished' then 90
            else b.target_value
          end
        )
        order by b.created_at
      ),
      '[]'::jsonb
    )
    from badges b
    left join member_badges mb on mb.badge_id = b.id and mb.member_id = v_target_id
    where b.condition_field is not null
  );
end;
$$;

grant execute on function get_badge_progress(uuid) to authenticated;
