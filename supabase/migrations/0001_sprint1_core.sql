-- ============================================================
-- 90 Days Growing Together — Sprint 1 Migration
-- Tables: campaigns, members, missions, check_ins,
--         points_transactions, stickers, kindness_logs, audit_logs
-- Run once, top to bottom, in the Supabase SQL Editor.
-- pgcrypto (for gen_random_uuid) is enabled by default on Supabase.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
create type member_role as enum ('participant', 'admin', 'super_admin');

create type campaign_level as enum ('me', 'we', 'us');

create type sticker_color as enum ('green', 'pink', 'yellow', 'red', 'purple', 'orange', 'rainbow');

create type mission_category as enum (
  'know_me', 'sleep_me', 'move_me', 'eat_me',
  'buddy_walk', 'buddy_lunch', 'hydration_buddy', 'buddy_stretch',
  'big_step', 'zero_sugar_squad', 'lunch_walk_talk', 'gratitude'
);

create type kindness_category as enum (
  'help', 'walk_invite', 'compliment', 'encourage',
  'healthy_food_invite', 'rest_stretch_invite'
);

create type audit_action as enum (
  'adjust_points', 'approve_checkin', 'reject_checkin',
  'deactivate_member', 'assign_buddy', 'assign_squad',
  'edit_mission', 'other'
);

-- ------------------------------------------------------------
-- 1. CAMPAIGNS
-- ------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint campaigns_dates_chk check (end_date >= start_date)
);

create index idx_campaigns_active on campaigns (is_active);

-- ------------------------------------------------------------
-- 2. MEMBERS
-- auth_user_id links to Supabase Auth; server code must resolve
-- the caller as auth.uid() -> members.auth_user_id, never trust a
-- client-supplied member_id (Security Model, section 30).
-- ------------------------------------------------------------
create table members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  employee_code text not null unique,
  full_name text not null,
  department text,
  role member_role not null default 'participant',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_members_auth_user_id on members (auth_user_id);
create index idx_members_role on members (role);
create index idx_members_active on members (is_active);

-- ------------------------------------------------------------
-- 3. MISSIONS
-- ------------------------------------------------------------
create table missions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  level campaign_level not null,
  category mission_category not null,
  name text not null,
  description text,
  target_value numeric not null check (target_value > 0),
  unit text not null,
  points int not null default 0 check (points >= 0),
  sticker_color sticker_color,
  sticker_amount int not null default 0 check (sticker_amount >= 0),
  requires_proof boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_missions_campaign on missions (campaign_id);
create index idx_missions_level_active on missions (level, is_active);

-- ------------------------------------------------------------
-- 4. CHECK_INS
-- One row per member per mission per campaign week.
-- ------------------------------------------------------------
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  campaign_week int not null check (campaign_week > 0),
  value numeric not null default 0 check (value >= 0),
  note text,
  proof_url text,
  proof_status text not null default 'not_required'
    check (proof_status in ('not_required', 'pending', 'approved', 'rejected')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, member_id, campaign_week)
);

create index idx_checkins_member_week on check_ins (member_id, campaign_week);
create index idx_checkins_mission on check_ins (mission_id);
create index idx_checkins_pending_proof on check_ins (proof_status) where proof_status = 'pending';

-- ------------------------------------------------------------
-- 5. POINTS_TRANSACTIONS
-- Append-only ledger. Never updated in place — corrections are a
-- new signed row (source = 'admin_adjust'), so audit_logs can
-- always show old_value/new_value truthfully.
-- ------------------------------------------------------------
create table points_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  points int not null,
  source text not null check (source in ('mission', 'kindness', 'admin_adjust')),
  source_ref_id uuid,
  created_at timestamptz not null default now()
);

create index idx_points_member on points_transactions (member_id);
create index idx_points_source on points_transactions (source);

-- ------------------------------------------------------------
-- 6. STICKERS
-- ------------------------------------------------------------
create table stickers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  color sticker_color not null,
  amount int not null default 1 check (amount > 0),
  source text not null check (source in ('mission', 'kindness')),
  source_ref_id uuid,
  created_at timestamptz not null default now()
);

create index idx_stickers_member on stickers (member_id);

-- ------------------------------------------------------------
-- 7. KINDNESS_LOGS
-- Anti-abuse (spec section 15) is enforced in the giveKindness()
-- RPC (Sprint 2/3), not here — this table only stores the record.
-- ------------------------------------------------------------
create table kindness_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  from_member_id uuid not null references members (id) on delete cascade,
  to_member_id uuid not null references members (id) on delete cascade,
  category kindness_category not null,
  message text,
  campaign_week int not null check (campaign_week > 0),
  created_at timestamptz not null default now(),
  constraint kindness_no_self_send check (from_member_id <> to_member_id)
);

create index idx_kindness_to_week on kindness_logs (to_member_id, campaign_week);
create index idx_kindness_pair_week on kindness_logs (from_member_id, to_member_id, campaign_week);

-- ------------------------------------------------------------
-- 8. AUDIT_LOGS
-- Every admin action that changes points, approves proof, or
-- otherwise touches another member's record must write here.
-- ------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references members (id),
  action audit_action not null,
  target_type text not null,
  target_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_admin on audit_logs (admin_id);
create index idx_audit_target on audit_logs (target_type, target_id);

-- ============================================================
-- ROW LEVEL SECURITY  (Security Model, spec section 30)
-- ============================================================
alter table campaigns enable row level security;
alter table members enable row level security;
alter table missions enable row level security;
alter table check_ins enable row level security;
alter table points_transactions enable row level security;
alter table stickers enable row level security;
alter table kindness_logs enable row level security;
alter table audit_logs enable row level security;

-- Helper functions: resolve the calling member + role from auth.uid()
create or replace function auth_member_id() returns uuid
language sql stable
as $$
  select id from members where auth_user_id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql stable
as $$
  select exists (
    select 1 from members
    where auth_user_id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

-- ---------------- campaigns ----------------
-- Read: any authenticated member. Write: admins only.
create policy campaigns_select on campaigns
  for select using (auth.uid() is not null);
create policy campaigns_admin_write on campaigns
  for all using (is_admin()) with check (is_admin());

-- ---------------- members ----------------
-- Participant: SELECT own profile only. Admin: full CRUD + read all.
create policy members_select_own_or_admin on members
  for select using (auth_user_id = auth.uid() or is_admin());
create policy members_admin_write on members
  for all using (is_admin()) with check (is_admin());

-- ---------------- missions ----------------
-- Read: any authenticated member. Write: admins only.
create policy missions_select on missions
  for select using (auth.uid() is not null);
create policy missions_admin_write on missions
  for all using (is_admin()) with check (is_admin());

-- ---------------- check_ins ----------------
-- Participant: SELECT + INSERT own check-ins only, no UPDATE/DELETE
-- from the client (progress/rewards are written server-side).
-- Admin: read all, and update (for proof approve/reject).
create policy checkins_select_own_or_admin on check_ins
  for select using (member_id = auth_member_id() or is_admin());
create policy checkins_insert_own on check_ins
  for insert with check (member_id = auth_member_id());
create policy checkins_admin_update on check_ins
  for update using (is_admin()) with check (is_admin());

-- ---------------- points_transactions ----------------
-- Participant: SELECT own only, NO INSERT/UPDATE/DELETE — points are
-- only ever written by a SECURITY DEFINER function running as the
-- service role logic, never a direct client write.
create policy points_select_own_or_admin on points_transactions
  for select using (member_id = auth_member_id() or is_admin());
revoke insert, update, delete on points_transactions from authenticated;

-- ---------------- stickers ----------------
-- Same rule as points_transactions: read-only for the owner.
create policy stickers_select_own_or_admin on stickers
  for select using (member_id = auth_member_id() or is_admin());
revoke insert, update, delete on stickers from authenticated;

-- ---------------- kindness_logs ----------------
-- Participant: SELECT anything they sent or received; INSERT is
-- allowed at the table level (anti-abuse limits are enforced in the
-- Sprint 2/3 giveKindness() function) but only as themselves.
create policy kindness_select_involved_or_admin on kindness_logs
  for select using (
    from_member_id = auth_member_id()
    or to_member_id = auth_member_id()
    or is_admin()
  );
create policy kindness_insert_as_self on kindness_logs
  for insert with check (from_member_id = auth_member_id());
revoke update, delete on kindness_logs from authenticated;

-- ---------------- audit_logs ----------------
-- Admin-read only. No client INSERT/UPDATE/DELETE at all — every
-- audit row is written by a SECURITY DEFINER function alongside the
-- action it's logging, so even an admin's own client can't forge one.
create policy audit_logs_admin_select on audit_logs
  for select using (is_admin());
revoke insert, update, delete on audit_logs from authenticated;
