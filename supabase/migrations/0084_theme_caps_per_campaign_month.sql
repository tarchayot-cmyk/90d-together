-- Applied via Supabase MCP (theme_caps_per_campaign_month + complete_mission_use_month_caps).
-- theme_monthly_caps gets a campaign_month dimension (PK campaign_id, theme, campaign_month).
-- Month 2 (WE, 15 Oct - 13 Nov) caps: move 1200, fuel 600, rest 500, mind 500, connect 700.
-- complete_mission() and admin_approve_checkin() look up the cap for the current campaign month,
-- falling back to month 1's cap when the month has none (month 3 currently falls back).
alter table public.theme_monthly_caps add column if not exists campaign_month int not null default 1 check (campaign_month between 1 and 3);
alter table public.theme_monthly_caps drop constraint theme_monthly_caps_pkey;
alter table public.theme_monthly_caps add primary key (campaign_id, theme, campaign_month);
insert into public.theme_monthly_caps (campaign_id, theme, monthly_cap, campaign_month)
select campaign_id, theme,
       case theme when 'move' then 1200 when 'fuel' then 600 when 'rest' then 500 when 'mind' then 500 when 'connect' then 700 end, 2
from public.theme_monthly_caps where campaign_month = 1 on conflict do nothing;
