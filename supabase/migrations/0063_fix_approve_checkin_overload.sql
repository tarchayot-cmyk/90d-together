-- Confirmed by the actual error:
-- PGRST203 — "Could not choose the best candidate function between:
-- admin_approve_checkin(p_checkin_id, p_approved) and
-- admin_approve_checkin(p_checkin_id, p_approved, p_reason)"
--
-- Adding a new parameter changes the function's arity, so
-- CREATE OR REPLACE in 0062 created a second overload instead of
-- replacing the original — both now exist. Drop the old 2-arg one;
-- the 3-arg version (with p_reason) from 0062 stays as the only one.
drop function if exists admin_approve_checkin(uuid, boolean);
