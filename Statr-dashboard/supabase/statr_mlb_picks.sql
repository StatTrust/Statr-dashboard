create table if not exists public.statr_mlb_picks (
  id text primary key,
  date date not null,
  game_pk text not null,
  matchup_id text not null,
  game_time_utc timestamptz,
  analysis_due_utc timestamptz,
  away_team text,
  home_team text,
  pick text,
  market text,
  confidence text,
  american_odds integer,
  stake numeric(12, 2) default 50,
  status text not null default 'pending',
  profit_loss numeric(12, 2),
  job_id text,
  analysis_url text,
  analysis_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_pk, matchup_id)
);

create index if not exists statr_mlb_picks_date_idx
  on public.statr_mlb_picks (date desc, game_time_utc asc);

create or replace function public.set_statr_mlb_picks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists statr_mlb_picks_updated_at on public.statr_mlb_picks;

create trigger statr_mlb_picks_updated_at
before update on public.statr_mlb_picks
for each row
execute function public.set_statr_mlb_picks_updated_at();

alter table public.statr_mlb_picks enable row level security;

drop policy if exists "Public can read Statr MLB picks" on public.statr_mlb_picks;

create policy "Public can read Statr MLB picks"
on public.statr_mlb_picks
for select
using (true);
