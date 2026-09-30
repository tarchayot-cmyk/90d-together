-- Two cleanup items found during a post-change bug sweep:
--
-- 1. theme_label() (added in 0077) was missing a pinned search_path,
--    flagged by Supabase's security advisor (function_search_path_mutable).
--
-- 2. The user is wiping the "proofs" storage bucket entirely (all 1,071
--    objects predate the requested cutoff and have been backed up
--    locally). Clearing check_ins.proof_urls ahead of that wipe so the
--    admin check-ins page doesn't render broken image icons once the
--    files are gone. Verified no 'pending' check-in referenced these
--    files at the time of this migration, so nothing awaiting review
--    is affected.
--
-- Applied directly via Supabase MCP; this file just records the
-- migration in git.

create or replace function public.theme_label(p_theme text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_theme
    when 'move' then 'กาย (Move)'
    when 'fuel' then 'กิน (Fuel)'
    when 'rest' then 'พัก (Rest)'
    when 'mind' then 'ใจ (Mind)'
    when 'connect' then 'สังคม (Connect)'
    else p_theme
  end;
$$;

update check_ins
set proof_urls = null
where proof_urls is not null;
