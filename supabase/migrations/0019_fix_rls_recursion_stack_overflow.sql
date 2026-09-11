-- ============================================================
-- Fix: "stack depth limit exceeded" (Postgres error 54001) when
-- querying notifications (or anything else that calls
-- auth_member_id()/is_admin() inside an RLS policy).
--
-- Root cause: auth_member_id() and is_admin() were plain invoker-
-- rights functions that query `members` — a table protected by its
-- own RLS policy, which itself calls is_admin(). This is a classic
-- Postgres/Supabase RLS-recursion trap. The fix (standard, documented
-- Supabase best practice): make these two helper functions
-- SECURITY DEFINER, so their internal SELECT on `members` bypasses
-- RLS entirely instead of re-triggering policy evaluation.
--
-- Nothing about their logic, return type, or behavior changes for
-- any caller — this only removes the recursion risk. Since these
-- two functions are used throughout the whole schema (every RLS
-- policy and RPC), this fix applies everywhere at once without
-- needing to touch any other function.
-- ============================================================

create or replace function auth_member_id() returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from members where auth_user_id = auth.uid();
$$;

create or replace function is_admin() returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from members
    where auth_user_id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

-- Sanity check: should return your own member id with no error.
select auth_member_id();
