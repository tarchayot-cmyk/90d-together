-- Remove the pre-theme-redesign overload of admin_upsert_badge
-- (p_level based, 9 params) that was left behind when migration
-- 0051/0053 introduced the theme-based version (p_theme + p_icon_url,
-- 10 params). Having both live risks PGRST203 "could not choose the
-- best candidate function" errors from PostgREST. The frontend
-- (admin/badges/page.tsx) only ever calls with p_theme/p_icon_url
-- named args, matching the 10-param version, which is kept.
drop function if exists public.admin_upsert_badge(uuid, text, text, text, text, text, text, text, numeric);
