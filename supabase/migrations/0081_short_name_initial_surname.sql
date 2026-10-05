-- Change short_name() (added in 0080) from "given name + full surname" to
-- "given name + first consonant of surname", e.g. "จิรพร ล." -- so
-- participants can't read each other's full surname in member-facing views.
-- Leading vowels (เ แ โ ไ ใ) are skipped, so เลิศสุวรรณ -> ล. and
-- เอี่ยมศรี -> อ. members.full_name and admin pages are unchanged.
--
-- Also rewrites notification text that 0080 had already shortened to
-- "given name + surname". Applied directly via Supabase MCP; this file
-- records it in git.

create or replace function public.short_name(p_name text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(
    nullif(
      trim(
        split_part(s, ' ', 1) ||
        case
          when nullif(split_part(s, ' ', 2), '') is null then ''
          else ' ' || coalesce(substring(split_part(s, ' ', 2) from '[ก-ฮ]'), left(split_part(s, ' ', 2), 1)) || '.'
        end
      ),
      ''
    ),
    p_name
  )
  from (
    select regexp_replace(
             regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'),
             '^(ภญ\.|ภก\.|นางสาว|นาง|นาย|ว่าที่ร้อยตรี|ดร\.)\s*',
             ''
           ) as s
  ) t
$$;

do $$
declare
  r record;
begin
  for r in
    select
      trim(split_part(s, ' ', 1) || ' ' || split_part(s, ' ', 2)) as old_sn,
      short_name(full_name) as new_sn
    from (
      select full_name,
             regexp_replace(
               regexp_replace(trim(full_name), '\s+', ' ', 'g'),
               '^(ภญ\.|ภก\.|นางสาว|นาง|นาย|ว่าที่ร้อยตรี|ดร\.)\s*', ''
             ) as s
      from members
    ) x
    where split_part(s, ' ', 2) <> ''
  loop
    update notifications
      set message = replace(message, r.old_sn, r.new_sn)
      where position(r.old_sn in message) > 0;
  end loop;
end $$;
