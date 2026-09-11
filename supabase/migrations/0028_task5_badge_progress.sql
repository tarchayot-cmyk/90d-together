-- ============================================================
-- TASK 5 — Badge progress display
-- Read-only. Mirrors the condition math already used inside
-- check_achievements() (0004) so the numbers shown always match
-- what actually unlocks a badge — but this function has NO side
-- effects (no inserts into member_badges) and check_achievements()
-- itself is completely untouched.
-- ============================================================
create or replace function get_badge_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_campaign campaigns%rowtype;
  v_streak int := 0;
  v_weekly_missions int := 0;
  v_buddy_missions int := 0;
  v_squad_success boolean := false;
  v_kindness_received int := 0;
  v_current_day int := 0;
  v_current_week int;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_campaign from campaigns where is_active = true order by start_date desc limit 1;

  if v_campaign.id is not null then
    v_current_week := greatest(1, ceil((current_date - v_campaign.start_date + 1)::numeric / 7)::int);
    v_current_day := greatest(0, current_date - v_campaign.start_date + 1);

    select count(distinct campaign_week) into v_streak
      from check_ins where member_id = v_member_id and completed_at is not null;

    select count(*) into v_weekly_missions
      from check_ins
      where member_id = v_member_id and completed_at is not null and campaign_week = v_current_week;

    select count(*) into v_buddy_missions
      from check_ins ci join missions m on m.id = ci.mission_id
      where ci.member_id = v_member_id and ci.completed_at is not null and m.level = 'we';

    select exists (
      select 1 from check_ins ci join missions m on m.id = ci.mission_id
      where ci.member_id = v_member_id and ci.completed_at is not null and m.level = 'us'
    ) into v_squad_success;

    select count(*) into v_kindness_received
      from kindness_logs where to_member_id = v_member_id and campaign_id = v_campaign.id;
  end if;

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
          'current_value', case b.code
            when '7_day_warrior' then least(v_streak, 7)
            when 'consistency_master' then least(v_weekly_missions, 4)
            when 'buddy_hero' then least(v_buddy_missions, 3)
            when 'squad_champion' then case when v_squad_success then 1 else 0 end
            when 'kindness_star' then least(v_kindness_received, 5)
            when '90_day_finisher' then least(v_current_day, 90)
            else 0
          end,
          'target_value', case b.code
            when '7_day_warrior' then 7
            when 'consistency_master' then 4
            when 'buddy_hero' then 3
            when 'squad_champion' then 1
            when 'kindness_star' then 5
            when '90_day_finisher' then 90
            else 1
          end
        )
        order by b.created_at
      ),
      '[]'::jsonb
    )
    from badges b
    left join member_badges mb on mb.badge_id = b.id and mb.member_id = v_member_id
  );
end;
$$;

grant execute on function get_badge_progress() to authenticated;
