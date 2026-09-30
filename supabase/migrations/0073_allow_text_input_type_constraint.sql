-- The table-level CHECK constraint was missed in migration 0072 —
-- admin_upsert_mission's own validation already allowed 'text', but
-- the underlying missions.input_type CHECK constraint still only
-- allowed 'numeric'/'checkbox', so any text-type mission insert/update
-- failed with a 23514 constraint violation. Applied directly via
-- Supabase MCP; this file just records the migration in git.
alter table missions drop constraint missions_input_type_check;
alter table missions add constraint missions_input_type_check
  check (input_type = any (array['numeric'::text, 'checkbox'::text, 'text'::text]));
