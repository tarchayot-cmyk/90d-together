-- Monthly per-theme points cap (the "รื้อทำใหม่" redesign).
-- New table holding, per campaign + theme, a cap on how many points a
-- member can earn from that theme within a 30-day campaign-month.
-- Default: 350 pts/theme/month for every theme on the active campaign —
-- the same cap on all 5 themes so no single theme (however many missions
-- it has) can dominate a member's total score. Applied directly via
-- Supabase MCP; this file just records the migration in git.

create table if not exists theme_monthly_caps (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  theme text not null check (theme in ('move', 'fuel', 'rest', 'mind', 'connect')),
  monthly_cap integer not null check (monthly_cap > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, theme)
);

alter table theme_monthly_caps enable row level security;

create policy "theme_monthly_caps_select_all" on theme_monthly_caps
  for select using (true);

insert into theme_monthly_caps (campaign_id, theme, monthly_cap)
select c.id, t.theme, 350
from campaigns c
cross join (values ('move'), ('fuel'), ('rest'), ('mind'), ('connect')) as t(theme)
where c.is_active = true
on conflict (campaign_id, theme) do nothing;
