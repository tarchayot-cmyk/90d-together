-- ============================================================
-- Task 3 refinements (requested after initial testing):
-- 1. Members no longer see who proposed an activity (Admin still does)
-- 2. Rejected proposals are hidden from the member-facing voting page
--    (Admin still sees everything, for management purposes)
-- 3. Voting changes from single "upvote" to explicit เอา/ไม่เอา choice,
--    and a member can change their mind (re-voting updates their
--    existing choice instead of erroring)
-- ============================================================

-- 1. Add the choice column. Additive — existing rows (if any test
-- votes exist) default to 'yes', nothing is deleted.
alter table activity_votes
  add column if not exists choice text not null default 'yes' check (choice in ('yes', 'no'));

-- 2. cast_vote() signature changes (uuid) -> (uuid, text), so the
-- old single-argument version must be dropped explicitly first —
-- CREATE OR REPLACE cannot change a function's argument list, it
-- would just create a second overloaded function otherwise.
drop function if exists cast_vote(uuid);

create or replace function cast_vote(p_proposal_id uuid, p_choice text default 'yes')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_prop activity_proposals%rowtype;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_choice not in ('yes', 'no') then
    raise exception 'invalid_choice';
  end if;

  select * into v_prop from activity_proposals where id = p_proposal_id;
  if v_prop.id is null then
    raise exception 'proposal_not_found';
  end if;
  if v_prop.status <> 'voting' then
    raise exception 'voting_not_open';
  end if;

  -- Upsert: voting again just updates the member's existing choice
  -- instead of erroring — lets someone change their mind before the
  -- poll closes.
  insert into activity_votes (proposal_id, member_id, choice)
  values (p_proposal_id, v_member_id, p_choice)
  on conflict (proposal_id, member_id) do update set choice = excluded.choice;

  return jsonb_build_object('success', true, 'choice', p_choice);
end;
$$;

grant execute on function cast_vote(uuid, text) to authenticated;

-- 3. get_proposals_with_votes() — hide proposer name from non-admins,
-- hide rejected proposals from non-admins, return yes/no tallies and
-- the caller's own current choice instead of a single vote_count.
create or replace function get_proposals_with_votes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
begin
  v_admin := is_admin();

  return (
    select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'description', p.description,
        'status', p.status,
        'proposed_by_name', case when v_admin then p.proposed_by_name else null end,
        'created_at', p.created_at,
        'voting_opened_at', p.voting_opened_at,
        'voting_closed_at', p.voting_closed_at,
        'yes_count', (select count(*) from activity_votes v where v.proposal_id = p.id and v.choice = 'yes'),
        'no_count', (select count(*) from activity_votes v where v.proposal_id = p.id and v.choice = 'no'),
        'my_choice', (
          select v.choice from activity_votes v
          where v.proposal_id = p.id and v.member_id = auth_member_id()
        )
      ) as row_data
      from activity_proposals p
      where v_admin or p.status <> 'rejected'
    ) sub
  );
end;
$$;

grant execute on function get_proposals_with_votes() to authenticated;
