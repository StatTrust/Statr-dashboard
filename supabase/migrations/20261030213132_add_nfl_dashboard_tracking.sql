begin;
create table if not exists public.statr_nfl_picks (
  like public.statr_mlb_picks including defaults including constraints including indexes
);
alter table public.statr_nfl_picks
  add column if not exists season integer not null,
  add column if not exists week integer not null check (week between 1 and 18);
alter table public.statr_nfl_picks enable row level security;
revoke all on public.statr_nfl_picks from public, anon, authenticated;
grant select, insert, update, delete on public.statr_nfl_picks to service_role;
create index if not exists statr_nfl_picks_season_week_idx on public.statr_nfl_picks(season, week);
insert into public.statr_dashboard_settings(setting_key, enabled, updated_by)
values ('nfl_auto_analysis', false, 'migration'), ('nba_auto_analysis', false, 'migration')
on conflict (setting_key) do nothing;
commit;
