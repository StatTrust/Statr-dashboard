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
  market text not null default 'moneyline',
  confidence text,
  american_odds integer,
  stake numeric(12, 2) default 100,
  status text not null default 'pending',
  profit_loss numeric(12, 2),
  job_id text,
  analysis_url text,
  analysis_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.statr_mlb_picks
  alter column market set default 'moneyline';

update public.statr_mlb_picks
set market = 'moneyline'
where market is null;

alter table public.statr_mlb_picks
  alter column market set not null;

alter table public.statr_mlb_picks
  alter column stake set default 100;

alter table public.statr_mlb_picks
  drop constraint if exists statr_mlb_picks_game_pk_matchup_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'statr_mlb_picks_game_market_key'
      and conrelid = 'public.statr_mlb_picks'::regclass
  ) then
    alter table public.statr_mlb_picks
      add constraint statr_mlb_picks_game_market_key unique (game_pk, matchup_id, market);
  end if;
end $$;

create index if not exists statr_mlb_picks_date_idx
  on public.statr_mlb_picks (date desc, game_time_utc asc);

create index if not exists statr_mlb_picks_date_market_idx
  on public.statr_mlb_picks (date desc, market, game_time_utc asc);

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
