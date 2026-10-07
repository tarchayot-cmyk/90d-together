-- Applied via Supabase MCP (notification_types_comeback_weekly_goal).
-- Separate migration: new enum values must be committed before use.
alter type notification_type add value if not exists 'comeback_bonus';
alter type notification_type add value if not exists 'weekly_goal_completed';
