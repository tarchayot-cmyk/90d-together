-- Raise the `move` theme's monthly cap from the default 350 to 700
-- pts/month — move has by far the most missions/weekly ceiling, so it
-- gets a higher (but still finite) monthly cap instead of the same
-- cap as the other themes. Applied directly via Supabase MCP; this
-- file just records the migration in git.

update theme_monthly_caps
set monthly_cap = 700, updated_at = now()
where theme = 'move'
  and campaign_id = (select id from campaigns where is_active = true);
