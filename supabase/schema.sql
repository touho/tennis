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

insert into tournament_state (id, status)
values (1, 'not_started')
on conflict (id) do nothing;

alter table players disable row level security;
alter table matches disable row level security;
alter table tournament_state disable row level security;
