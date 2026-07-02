-- Riftbound Tracker: match / game tracking (Phase 1: 1v1 scoring)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  format text not null default '1v1',
  match_type text not null default 'bo1',
  point_target integer not null default 8,
  played_at timestamptz not null default now(),
  notes text,
  share_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  seat smallint not null,
  team_no smallint,
  display_name text not null,
  user_id uuid references auth.users (id) on delete set null,
  legend_card_id text not null references public.cards (id),
  domains text[] not null default '{}',
  deck_name text,
  claim_token uuid default gen_random_uuid(),
  claimed_at timestamptz,
  unique (match_id, seat)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  game_no smallint not null,
  first_player_seat smallint not null,
  winner_seat smallint,
  point_target integer,
  unique (match_id, game_no)
);

create table public.game_battlefields (
  game_id uuid not null references public.games (id) on delete cascade,
  position smallint not null,
  card_id text not null references public.cards (id),
  contributed_by_seat smallint,
  primary key (game_id, position)
);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  seq integer not null,
  turn_no integer not null default 1,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (game_id, seq)
);

create index matches_owner_id_idx on public.matches (owner_id);
create index match_players_match_id_idx on public.match_players (match_id);
create index match_players_user_id_idx on public.match_players (user_id);
create index games_match_id_idx on public.games (match_id);
create index game_events_game_id_seq_idx on public.game_events (game_id, seq);

-- ---------------------------------------------------------------------------
-- Analytics view
-- ---------------------------------------------------------------------------

create view public.scoring_events as
select
  ge.id,
  ge.game_id,
  ge.seq,
  ge.turn_no,
  (ge.payload->>'scorer_seat')::smallint as scorer_seat,
  (ge.payload->>'battlefield_position')::smallint as battlefield_position,
  coalesce((ge.payload->>'points')::integer, 1) as points,
  ge.payload->>'source' as source,
  ge.created_at
from public.game_events ge
where ge.event_type = 'score';

-- ---------------------------------------------------------------------------
-- Helper: security definer avoids RLS cross-table / self-reference recursion.
-- Queries matches + match_players directly (bypassing RLS) to answer "can this
-- user read rows belonging to a given match?".
-- ---------------------------------------------------------------------------

create or replace function public.auth_can_access_match(p_match_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
    and (
      m.owner_id = auth.uid()
      or exists (
        select 1 from public.match_players mp
        where mp.match_id = p_match_id and mp.user_id = auth.uid()
      )
    )
  );
$$;

grant execute on function public.auth_can_access_match(uuid) to authenticated;

-- Checks ONLY match_players (never re-queries matches), so it is safe to use
-- inside the matches SELECT policy: it avoids recursion AND avoids the
-- INSERT...RETURNING problem where the just-inserted matches row is not yet
-- visible to a self-scan. The owner case is handled by a direct column compare
-- in the policy itself.
create or replace function public.auth_is_match_player(p_match_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.match_players mp
    where mp.match_id = p_match_id and mp.user_id = auth.uid()
  );
$$;

grant execute on function public.auth_is_match_player(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.games enable row level security;
alter table public.game_battlefields enable row level security;
alter table public.game_events enable row level security;

-- matches: owner or linked player may read; only owner may write.
-- The owner check reads the row's own owner_id column directly so it works for
-- INSERT...RETURNING (the new row is not yet visible to a self-scan). The
-- linked-player check uses a security-definer helper that only touches
-- match_players, so there is no recursion back into this policy.
create policy "match read" on public.matches
  for select using (
    owner_id = auth.uid()
    or public.auth_is_match_player(id)
  );

create policy "match insert" on public.matches
  for insert to authenticated with check (owner_id = auth.uid());

create policy "match update" on public.matches
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "match delete" on public.matches
  for delete using (owner_id = auth.uid());

-- match_players: same helper — avoids the mp2 self-join that caused recursion
create policy "match_players read" on public.match_players
  for select using (auth_can_access_match(match_id));

create policy "match_players owner write" on public.match_players
  for insert with check (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  );

create policy "match_players owner update" on public.match_players
  for update using (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  );

create policy "match_players owner delete" on public.match_players
  for delete using (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  );

-- games
create policy "games read" on public.games
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
      and (
        m.owner_id = auth.uid()
        or exists (
          select 1 from public.match_players mp
          where mp.match_id = m.id and mp.user_id = auth.uid()
        )
      )
    )
  );

create policy "games owner insert" on public.games
  for insert with check (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  );

create policy "games owner update" on public.games
  for update using (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  );

create policy "games owner delete" on public.games
  for delete using (
    exists (select 1 from public.matches m where m.id = match_id and m.owner_id = auth.uid())
  );

-- game_battlefields
create policy "game_battlefields read" on public.game_battlefields
  for select using (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id
      and (
        m.owner_id = auth.uid()
        or exists (
          select 1 from public.match_players mp
          where mp.match_id = m.id and mp.user_id = auth.uid()
        )
      )
    )
  );

create policy "game_battlefields owner insert" on public.game_battlefields
  for insert with check (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  );

create policy "game_battlefields owner update" on public.game_battlefields
  for update using (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  );

create policy "game_battlefields owner delete" on public.game_battlefields
  for delete using (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  );

-- game_events
create policy "game_events read" on public.game_events
  for select using (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id
      and (
        m.owner_id = auth.uid()
        or exists (
          select 1 from public.match_players mp
          where mp.match_id = m.id and mp.user_id = auth.uid()
        )
      )
    )
  );

create policy "game_events owner insert" on public.game_events
  for insert with check (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  );

create policy "game_events owner update" on public.game_events
  for update using (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  );

create policy "game_events owner delete" on public.game_events
  for delete using (
    exists (
      select 1 from public.games g
      join public.matches m on m.id = g.match_id
      where g.id = game_id and m.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Postgres role grants (required alongside RLS for PostgREST)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.matches          to authenticated;
grant select, insert, update, delete on public.match_players    to authenticated;
grant select, insert, update, delete on public.games            to authenticated;
grant select, insert, update, delete on public.game_battlefields to authenticated;
grant select, insert, update, delete on public.game_events     to authenticated;
grant select on public.scoring_events                           to authenticated;

grant all on public.matches          to service_role;
grant all on public.match_players    to service_role;
grant all on public.games            to service_role;
grant all on public.game_battlefields to service_role;
grant all on public.game_events      to service_role;
grant all on public.scoring_events   to service_role;

-- ---------------------------------------------------------------------------
-- Claim seat RPC (security definer — non-owner can attribute their seat)
-- ---------------------------------------------------------------------------

create or replace function public.claim_match_player(p_claim_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_players
     set user_id = auth.uid(), claimed_at = now(), claim_token = null
   where claim_token = p_claim_token and user_id is null;

  if not found then
    raise exception 'Invalid or already claimed token';
  end if;
end;
$$;

grant execute on function public.claim_match_player(uuid) to authenticated;
