-- ============================================================
-- New: let a member see their own Kindness SENDING history —
-- who they sent to, category, message, whether it awarded points
-- (based on the receiver's weekly quota at the time), and when.
-- No privacy issue: this is the sender's OWN history, and a sender
-- already knows who they sent to — the anonymity rule only hides
-- the sender's identity FROM the receiver, not the reverse.
-- ============================================================
create or replace function get_my_sent_kindness()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_result jsonb;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into v_result
  from (
    select
      k.id,
      k.created_at,
      k.category,
      k.message,
      k.campaign_week,
      receiver.full_name as to_name,
      exists (
        select 1 from points_transactions pt
        where pt.source = 'kindness' and pt.source_ref_id = k.id
      ) as awarded_points
    from kindness_logs k
    join members receiver on receiver.id = k.to_member_id
    where k.from_member_id = v_member_id
  ) row_data(id, created_at, category, message, campaign_week, to_name, awarded_points);

  return v_result;
end;
$$;

grant execute on function get_my_sent_kindness() to authenticated;
