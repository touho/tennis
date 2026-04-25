create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  player_a_id uuid not null references players(id) on delete cascade,
  player_b_id uuid not null references players(id) on delete cascade,
  winner_id uuid not null references players(id) on delete cascade,
  stage text not null check (stage in ('alkusarja', 'finaali')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_a_id <> player_b_id),
  check (winner_id = player_a_id or winner_id = player_b_id)
);

create table if not exists tournament_state (
  id smallint primary key default 1 check (id = 1),
  status text not null default 'not_started'
    check (status in ('not_started', 'group_stage', 'final')),
  final_player_a_id uuid references players(id) on delete set null,
  final_player_b_id uuid references players(id) on delete set null,
  champion_id uuid references players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
grant all on tables to anon, authenticated;

alter default privileges in schema public
grant all on sequences to anon, authenticated;

alter table players enable row level security;
alter table matches enable row level security;
alter table tournament_state enable row level security;

drop policy if exists "public players access" on players;
create policy "public players access"
on players
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public matches access" on matches;
create policy "public matches access"
on matches
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public tournament state access" on tournament_state;
create policy "public tournament state access"
on tournament_state
for all
to anon, authenticated
using (true)
with check (true);

insert into tournament_state (id, status)
values (1, 'not_started')
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'tournament_state'
  ) then
    alter publication supabase_realtime add table public.tournament_state;
  end if;
end
$$;
