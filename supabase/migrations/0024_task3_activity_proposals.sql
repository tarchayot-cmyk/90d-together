-- ============================================================
-- TASK 3 — Weekly Activity Proposal + Admin Approve + Member Vote
-- Confirmed scope: this is a standalone poll. An approved/voted
-- activity does NOT auto-create a mission — Admin creates the
-- mission manually via /admin/missions afterward if they want to.
-- ============================================================

-- 0. New notification types needed for this task (Task 1 only
-- reserved values for Task 2's invite flow). Each ADD VALUE as its
-- own statement — if your SQL editor errors on "unsafe use of new
-- value" when run together with the rest of this file, run just
-- these 3 lines first, then the rest of the file separately after.
alter type notification_type add value if not exists 'proposal_approved';
alter type notification_type add value if not exists 'proposal_rejected';
alter type notification_type add value if not exists 'voting_opened';

create type proposal_status as enum ('pending', 'approved', 'rejected', 'voting', 'closed');

-- ------------------------------------------------------------
-- 1. Tables
-- proposed_by_name is a denormalized snapshot (like other public-
-- facing name fields in this app) to avoid needing another RPC just
-- to join a display name — same reasoning as list_colleagues()/
-- get_my_invitations() exist: members' own RLS blocks reading other
-- people's rows directly, so we either snapshot the name at write
-- time or read through a SECURITY DEFINER function. Here the name
-- is genuinely public (whoever proposed something everyone can see
-- and vote on), so a direct RLS policy is simpler and used below —
-- but we still snapshot the name to avoid one extra join per read.
-- ------------------------------------------------------------
create table activity_proposals (
  id uuid primary key default gen_random_uuid(),
  proposed_by uuid not null references members (id) on delete cascade,
  proposed_by_name text not null,
  title text not null,
  description text,
  status proposal_status not null default 'pending',
  reviewed_by uuid references members (id),
  reviewed_at timestamptz,
  voting_opened_at timestamptz,
  voting_closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_proposals_status on activity_proposals (status);

alter table activity_proposals enable row level security;

-- Public poll: any authenticated member can see all proposals (this
-- is intentionally different from invitations/kindness, which are
-- private between two people).
create policy proposals_select_all on activity_proposals
  for select using (auth.uid() is not null);

revoke insert, update, delete on activity_proposals from authenticated;

create table activity_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references activity_proposals (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (proposal_id, member_id)
);

create index idx_votes_proposal on activity_votes (proposal_id);

alter table activity_votes enable row level security;

create policy votes_select_all on activity_votes
  for select using (auth.uid() is not null);

revoke insert, update, delete on activity_votes from authenticated;

-- ============================================================
-- 2. propose_activity() — any member can submit a proposal
-- ============================================================
create or replace function propose_activity(p_title text, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_name text;
  v_id uuid;
begin
  v_member_id := auth_member_id();
  if v_member_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title_required';
  end if;

  select full_name into v_name from members where id = v_member_id;

  insert into activity_proposals (proposed_by, proposed_by_name, title, description)
  values (v_member_id, v_name, trim(p_title), p_description)
  returning id into v_id;

  return jsonb_build_object('success', true, 'proposal_id', v_id);
end;
$$;

grant execute on function propose_activity(text, text) to authenticated;

-- ============================================================
-- 3. admin_review_proposal() — approve/reject a pending proposal
-- ============================================================
create or replace function admin_review_proposal(p_proposal_id uuid, p_approved boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_prop activity_proposals%rowtype;
  v_new_status proposal_status;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select * into v_prop from activity_proposals where id = p_proposal_id;
  if v_prop.id is null then
    raise exception 'proposal_not_found';
  end if;
  if v_prop.status <> 'pending' then
    raise exception 'proposal_not_pending';
  end if;

  v_new_status := (case when p_approved then 'approved' else 'rejected' end)::proposal_status;

  update activity_proposals
    set status = v_new_status, reviewed_by = v_admin_id, reviewed_at = now()
    where id = p_proposal_id;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'activity_proposal', p_proposal_id, jsonb_build_object('status', v_new_status));

  begin
    perform create_notification(
      v_prop.proposed_by,
      (case when p_approved then 'proposal_approved' else 'proposal_rejected' end)::notification_type,
      'ข้อเสนอกิจกรรม "' || v_prop.title || '" ของคุณ' ||
        (case when p_approved then 'ได้รับการอนุมัติแล้ว 🎉' else 'ไม่ได้รับการอนุมัติในครั้งนี้' end),
      '/proposals',
      jsonb_build_object('proposal_id', p_proposal_id)
    );
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true, 'status', v_new_status);
end;
$$;

grant execute on function admin_review_proposal(uuid, boolean) to authenticated;

-- ============================================================
-- 4. admin_open_voting() — notifies every active participant
-- ============================================================
create or replace function admin_open_voting(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_prop activity_proposals%rowtype;
  v_member record;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select * into v_prop from activity_proposals where id = p_proposal_id;
  if v_prop.id is null then
    raise exception 'proposal_not_found';
  end if;
  if v_prop.status <> 'approved' then
    raise exception 'proposal_not_approved';
  end if;

  update activity_proposals
    set status = 'voting', voting_opened_at = now()
    where id = p_proposal_id;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'activity_proposal', p_proposal_id, jsonb_build_object('status', 'voting'));

  for v_member in select id from members where role = 'participant' and is_active = true loop
    begin
      perform create_notification(
        v_member.id,
        'voting_opened'::notification_type,
        'เปิดโหวตกิจกรรม "' || v_prop.title || '" แล้ว ไปร่วมโหวตกันเลย!',
        '/proposals',
        jsonb_build_object('proposal_id', p_proposal_id)
      );
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_open_voting(uuid) to authenticated;

-- ============================================================
-- 5. cast_vote() — one vote per member per proposal (DB unique
-- constraint backs this up regardless of client behavior)
-- ============================================================
create or replace function cast_vote(p_proposal_id uuid)
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

  select * into v_prop from activity_proposals where id = p_proposal_id;
  if v_prop.id is null then
    raise exception 'proposal_not_found';
  end if;
  if v_prop.status <> 'voting' then
    raise exception 'voting_not_open';
  end if;

  insert into activity_votes (proposal_id, member_id)
  values (p_proposal_id, v_member_id)
  on conflict (proposal_id, member_id) do nothing;

  if not found then
    raise exception 'already_voted';
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function cast_vote(uuid) to authenticated;

-- ============================================================
-- 6. admin_close_voting()
-- ============================================================
create or replace function admin_close_voting(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_prop activity_proposals%rowtype;
begin
  if not is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_admin_id := auth_member_id();

  select * into v_prop from activity_proposals where id = p_proposal_id;
  if v_prop.id is null then
    raise exception 'proposal_not_found';
  end if;
  if v_prop.status <> 'voting' then
    raise exception 'voting_not_open';
  end if;

  update activity_proposals
    set status = 'closed', voting_closed_at = now()
    where id = p_proposal_id;

  insert into audit_logs (admin_id, action, target_type, target_id, new_value)
  values (v_admin_id, 'other', 'activity_proposal', p_proposal_id, jsonb_build_object('status', 'closed'));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function admin_close_voting(uuid) to authenticated;

-- ============================================================
-- 7. get_proposals_with_votes() — read helper, one round trip
-- instead of the frontend joining proposals + vote counts +
-- "did I vote" itself.
-- ============================================================
create or replace function get_proposals_with_votes()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'description', p.description,
      'status', p.status,
      'proposed_by', p.proposed_by,
      'proposed_by_name', p.proposed_by_name,
      'created_at', p.created_at,
      'voting_opened_at', p.voting_opened_at,
      'voting_closed_at', p.voting_closed_at,
      'vote_count', (select count(*) from activity_votes v where v.proposal_id = p.id),
      'has_voted', exists (
        select 1 from activity_votes v where v.proposal_id = p.id and v.member_id = auth_member_id()
      )
    ) as row_data
    from activity_proposals p
  ) sub;
$$;

grant execute on function get_proposals_with_votes() to authenticated;
