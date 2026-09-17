select name, category, theme, target_value, unit, points, input_type, max_per_week, max_per_day
from missions
where level = 'me'
  and campaign_id = (select id from campaigns where is_active = true order by start_date desc limit 1)
order by theme, name;
