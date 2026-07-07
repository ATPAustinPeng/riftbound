-- Match score tracking: matches, per-game records, append-only game event log.
-- Ids are client-generated uuids (local-first sync idempotency); the default
-- gen_random_uuid() is a safety net only. Each table carries a denormalized
-- user_id so RLS stays a simple auth.uid() = user_id check (no join policies).

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  format text not null check (format in ('bo1', 'bo3')),
  game_mode text not null default '1v1' check (game_mode in ('1v1', '2v2', 'ffa')),
  my_legend_card_id text references public.cards (id),
  opponent_legend_card_id text references public.cards (id),
  my_deck_name text,
  opponent_deck_name text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  result text check (result in ('win', 'loss', 'draw')),
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target for the children's composite FKs (see match_games / game_events):
  -- referencing (id, user_id) instead of just id prevents a child row from
  -- being grafted onto another user's match.
  unique (id, user_id)
);

create table public.match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  user_id uuid not null,
  game_number integer not null,
  starting_player text check (starting_player in ('me', 'opponent')),
  my_battlefield_card_id text references public.cards (id),
  opponent_battlefield_card_id text references public.cards (id),
  my_mulligan_count integer check (my_mulligan_count between 0 and 2),
  opponent_mulligan_count integer check (opponent_mulligan_count between 0 and 2),
  side_notes text,
  -- Base by game mode (8 for 1v1, 11 for 2v2) plus battlefield modifiers;
  -- some battlefields raise the win target by 1 and these stack.
  target_score integer not null default 8,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  my_score integer not null default 0,
  opponent_score integer not null default 0,
  winner text check (winner in ('me', 'opponent', 'draw')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (match_id, game_number),
  unique (id, user_id),
  -- Composite FK pins user_id to the parent match's user_id, preventing
  -- cross-user row grafting (user_id integrity flows from matches.user_id →
  -- auth.users, so no separate user_id FK is needed here).
  foreign key (match_id, user_id) references public.matches (id, user_id) on delete cascade
);

-- Append-only, extensible event log (audio-inferred events land here later).
-- event_type is intentionally unconstrained SQL-side; validated client-side
-- so future event types need no migration.
create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  user_id uuid not null,
  -- Client insertion order, unique per game. The seq space is reserved to the
  -- tracking device (client); future server-side writers (audio inference)
  -- must use a disjoint seq space and rely on occurred_at for temporal
  -- interleaving.
  seq integer not null,
  turn_number integer,
  actor text not null check (actor in ('me', 'opponent', 'system')),
  event_type text not null,
  battlefield_card_id text references public.cards (id),
  points integer not null default 0,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (game_id, seq),
  -- Composite FK pins user_id to the parent game's user_id, preventing
  -- cross-user row grafting (see match_games).
  foreign key (game_id, user_id) references public.match_games (id, user_id) on delete cascade
);

-- No separate (match_id) / (game_id, seq) indexes: the unique constraints
-- (match_id, game_number) and (game_id, seq) already cover those lookups.
create index matches_user_id_started_at_idx on public.matches (user_id, started_at desc);
create index match_games_user_id_idx on public.match_games (user_id);
create index game_events_user_id_idx on public.game_events (user_id);

alter table public.matches enable row level security;
alter table public.match_games enable row level security;
alter table public.game_events enable row level security;

create policy "own rows" on public.matches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.match_games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.game_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- PostgREST needs explicit Postgres-level grants in addition to RLS policies.
grant select, insert, update, delete on public.matches     to authenticated;
grant select, insert, update, delete on public.match_games to authenticated;
grant select, insert, update, delete on public.game_events to authenticated;

grant all on public.matches     to service_role;
grant all on public.match_games to service_role;
grant all on public.game_events to service_role;
