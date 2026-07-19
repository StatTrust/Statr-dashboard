-- Run this once in Supabase SQL Editor before deploying the three-market dashboard.
-- It lets the same MLB game store one row each for moneyline, spread, and total.

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

create index if not exists statr_mlb_picks_date_market_idx
  on public.statr_mlb_picks (date desc, market, game_time_utc asc);
