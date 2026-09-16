create table if not exists public.statr_dashboard_settings (
  setting_key text primary key,
  enabled boolean not null default true,
  updated_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.statr_dashboard_settings enable row level security;

revoke all on table public.statr_dashboard_settings from anon, authenticated;
grant select, insert, update, delete on table public.statr_dashboard_settings to service_role;

insert into public.statr_dashboard_settings (setting_key, enabled, updated_by)
values ('mlb_auto_analysis', true, 'migration')
on conflict (setting_key) do nothing;
