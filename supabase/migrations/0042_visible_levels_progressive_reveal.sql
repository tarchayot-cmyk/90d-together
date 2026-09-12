-- ============================================================
-- Adds `visible_levels` — cumulative, never hides again once a
-- phase has started (unlike `unlocked_levels`, which is only for
-- check-in gating and closes WE back down once US starts).
-- Used to progressively reveal WE/US-related UI (leaderboard tabs,
-- Buddy/Squad cards) — ME only during ME, ME+WE during WE,
-- everything during US.
-- ============================================================
create or replace function get_campaign_phase_info()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_current_day int;
  v_primary_phase campaign_level;
  v_unlocked jsonb;
  v_visible jsonb;
begin
  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is null then
    return jsonb_build_object('has_campaign', false);
  end if;

  v_current_day := (current_date - v_campaign.start_date + 1)::int;

  v_primary_phase := case
    when v_current_day between 1 and 30 then 'me'::campaign_level
    when v_current_day between 31 and 60 then 'we'::campaign_level
    when v_current_day between 61 and 90 then 'us'::campaign_level
    else null
  end;

  v_unlocked := (
    select coalesce(jsonb_agg(lvl), '[]'::jsonb) from (
      select 'me' as lvl where v_current_day between 1 and 90
      union all
      select 'we' where v_current_day between 31 and 60
      union all
      select 'us' where v_current_day between 61 and 90
    ) t
  );

  v_visible := (
    select coalesce(jsonb_agg(lvl), '[]'::jsonb) from (
      select 'me' as lvl where v_current_day >= 1
      union all
      select 'we' where v_current_day >= 31
      union all
      select 'us' where v_current_day >= 61
    ) t
  );

  return jsonb_build_object(
    'has_campaign', true,
    'campaign_id', v_campaign.id,
    'campaign_name', v_campaign.name,
    'current_day', v_current_day,
    'primary_phase', v_primary_phase,
    'unlocked_levels', v_unlocked,
    'visible_levels', v_visible,
    'start_date', v_campaign.start_date,
    'end_date', v_campaign.end_date
  );
end;
$$;
