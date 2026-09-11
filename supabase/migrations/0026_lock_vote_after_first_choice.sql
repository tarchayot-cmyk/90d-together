-- ============================================================
-- Revert the "change your vote" upsert from 0025 — votes are now
-- locked after the first choice. A second attempt raises a real
-- error (also acts as a defensive backend guard even though the
-- frontend now hides the buttons after voting once).
-- ============================================================
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

  begin
    insert into activity_votes (proposal_id, member_id, choice)
    values (p_proposal_id, v_member_id, p_choice);
  exception when unique_violation then
    raise exception 'already_voted';
  end;

  return jsonb_build_object('success', true, 'choice', p_choice);
end;
$$;

grant execute on function cast_vote(uuid, text) to authenticated;
