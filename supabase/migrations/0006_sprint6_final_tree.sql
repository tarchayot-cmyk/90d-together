-- ============================================================
-- 90 Days Growing Together — Sprint 6 Migration
-- Final Tree / Summary Engine (spec section 23)
-- Depends on Sprints 1-5.
-- Run once, top to bottom, in the Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- get_final_tree_summary()
--
-- Open to any authenticated member (not admin-only) — the Final
-- Tree is a shared celebration page, not a management screen.
-- Before day 90 / end_date it returns is_complete=false with a
-- countdown so the frontend can show a "not yet" state instead of
-- an error. Uses the most recent campaign by start_date regardless
-- of is_active, since a campaign may already have been switched
-- off once it ended.
-- ============================================================
create or replace function get_final_tree_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_day int;
  v_is_complete boolean;
  v_participants int;
  v_stickers_by_color jsonb;
  v_stickers_total numeric;
  v_kindness_total int;
  v_badges_total int;
  v_growth_points_total numeric;
begin
  select * into v_campaign from campaigns order by start_date desc limit 1;

  if v_campaign.id is null then
    return jsonb_build_object('is_complete', false, 'has_campaign', false);
  end if;

  v_day := current_date - v_campaign.start_date + 1;
  v_is_complete := (v_day >= 90) or (current_date >= v_campaign.end_date);

  if not v_is_complete then
    return jsonb_build_object(
      'is_complete', false,
      'has_campaign', true,
      'campaign_name', v_campaign.name,
      'current_day', greatest(v_day, 0),
      'days_remaining', greatest((v_campaign.end_date - current_date), 0)
    );
  end if;

  select count(*) into v_participants
    from members where role = 'participant' and is_active = true;

  select coalesce(jsonb_object_agg(color, total), '{}'::jsonb) into v_stickers_by_color
    from (select color, sum(amount) as total from stickers group by color) s;

  select coalesce(sum(amount), 0) into v_stickers_total from stickers;

  select count(*) into v_kindness_total
    from kindness_logs where campaign_id = v_campaign.id;

  select count(*) into v_badges_total from member_badges;

  select coalesce(sum(points), 0) into v_growth_points_total from points_transactions;

  return jsonb_build_object(
    'is_complete', true,
    'has_campaign', true,
    'campaign_name', v_campaign.name,
    'participants', v_participants,
    'stickers_by_color', v_stickers_by_color,
    'stickers_total', v_stickers_total,
    'kindness_total', v_kindness_total,
    'badges_total', v_badges_total,
    'growth_points_total', v_growth_points_total
  );
end;
$$;

grant execute on function get_final_tree_summary() to authenticated;
