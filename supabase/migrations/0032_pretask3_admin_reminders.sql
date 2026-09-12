-- ============================================================
-- PRE-TASK 3 — Admin Reminder for Buddy/Squad
-- Purely computed on every call from: current phase (reused from
-- PRE-TASK 1's get_campaign_phase_info() logic) + whether any
-- buddy_groups/squads rows exist yet for the active campaign.
-- No scheduler, no stored "reminder resolved" flag — the reminder
-- simply stops appearing once assign_groups_randomly() has actually
-- been run, because that's what creates the rows this checks for.
-- ============================================================
create or replace function get_admin_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_current_day int;
  v_current_phase campaign_level;
  v_has_buddy_groups boolean := false;
  v_has_squads boolean := false;
begin
  -- Admin-only at the data layer, not just hidden in the UI — a
  -- member calling this directly gets rejected here regardless of
  -- what buttons they can see.
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;
  if v_campaign.id is null then
    return jsonb_build_object('needs_buddy_assignment', false, 'needs_squad_assignment', false);
  end if;

  v_current_day := (current_date - v_campaign.start_date + 1)::int;
  v_current_phase := case
    when v_current_day between 1 and 30 then 'me'::campaign_level
    when v_current_day between 31 and 60 then 'we'::campaign_level
    when v_current_day between 61 and 90 then 'us'::campaign_level
    else null
  end;

  select exists (select 1 from buddy_groups where campaign_id = v_campaign.id) into v_has_buddy_groups;
  select exists (select 1 from squads where campaign_id = v_campaign.id) into v_has_squads;

  return jsonb_build_object(
    -- Buddy reminder appears from WE onward and stays until actually
    -- done, even if it's now US phase (better to keep reminding than
    -- to silently drop it just because the phase moved on).
    'needs_buddy_assignment', (v_current_phase in ('we', 'us') and not v_has_buddy_groups),
    'needs_squad_assignment', (v_current_phase = 'us' and not v_has_squads),
    'current_phase', v_current_phase
  );
end;
$$;

grant execute on function get_admin_reminders() to authenticated;
