select level, category, name, description, target_value, unit, points, input_type, requires_proof
from missions
where campaign_id = (select id from campaigns where is_active = true order by start_date desc limit 1)
order by level, category, name;
