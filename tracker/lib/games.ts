import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type {
  DerivedScore,
  Game,
  GameBattlefield,
  GameEvent,
  GameWithDetails,
  Match,
  MatchFull,
  MatchPlayer,
  MatchType,
  MatchWithPlayers,
  ScoreEventPayload,
  ScoreSource,
} from '@/lib/types';

export const gameKeys = {
  matches: (userId: string) => ['matches', userId] as const,
  match: (id: string) => ['match', id] as const,
  gameEvents: (gameId: string) => ['gameEvents', gameId] as const,
};

const MATCH_SELECT = `
  *,
  match_players (*),
  games (
    *,
    game_battlefields (*),
    game_events (*)
  )
`;

function sortEvents(events: GameEvent[]): GameEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq);
}

function normalizeMatchRow(row: Record<string, unknown>): MatchFull {
  const players = ((row.match_players as MatchPlayer[]) ?? []).sort(
    (a, b) => a.seat - b.seat,
  );
  const games = ((row.games as Array<Record<string, unknown>>) ?? [])
    .map((g) => ({
      ...(g as unknown as Game),
      battlefields: ((g.game_battlefields as GameBattlefield[]) ?? []).sort(
        (a, b) => a.position - b.position,
      ),
      events: sortEvents((g.game_events as GameEvent[]) ?? []),
    }))
    .sort((a, b) => a.game_no - b.game_no);

  const { match_players: _mp, games: _g, ...match } = row;
  return { ...(match as unknown as Match), players, games };
}

async function fetchMatchesForUser(userId: string): Promise<MatchWithPlayers[]> {
  const { data: owned, error: ownedErr } = await supabase
    .from('matches')
    .select('*, match_players(*), games(id, game_no, winner_seat, match_id)')
    .eq('owner_id', userId)
    .order('played_at', { ascending: false });

  if (ownedErr) throw new Error(ownedErr.message);

  const { data: linked, error: linkedErr } = await supabase
    .from('match_players')
    .select('match_id, matches(*, match_players(*), games(id, game_no, winner_seat, match_id))')
    .eq('user_id', userId);

  if (linkedErr) throw new Error(linkedErr.message);

  const byId = new Map<string, MatchWithPlayers>();

  for (const row of owned ?? []) {
    const { match_players, games, ...match } = row as Match & {
      match_players: MatchPlayer[];
      games: MatchWithPlayers['games'];
    };
    byId.set(match.id, {
      ...match,
      players: (match_players ?? []).sort((a, b) => a.seat - b.seat),
      games: games ?? [],
    });
  }

  for (const row of linked ?? []) {
    const matchRow = row.matches as unknown as Record<string, unknown> | null;
    if (!matchRow) continue;
    const players = (matchRow.match_players as MatchPlayer[]) ?? [];
    const games = (matchRow.games as MatchWithPlayers['games']) ?? [];
    const { match_players: _mp, games: _g, ...match } = matchRow;
    const typed = match as unknown as Match;
    if (typed.owner_id !== userId) {
      byId.set(typed.id, {
        ...typed,
        players: players.sort((a, b) => a.seat - b.seat),
        games,
      });
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime(),
  );
}

async function fetchMatch(id: string): Promise<MatchFull | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeMatchRow(data as Record<string, unknown>);
}

async function fetchGameEvents(gameId: string): Promise<GameEvent[]> {
  const { data, error } = await supabase
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('seq', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as GameEvent[];
}

export function parseScorePayload(event: GameEvent): ScoreEventPayload | null {
  if (event.event_type !== 'score') return null;
  const p = event.payload as Partial<ScoreEventPayload>;
  if (typeof p.scorer_seat !== 'number') return null;
  return {
    scorer_seat: p.scorer_seat,
    battlefield_position: p.battlefield_position,
    points: p.points ?? 1,
    source: (p.source as ScoreSource) ?? 'battlefield',
  };
}

export function deriveScore(events: GameEvent[]): DerivedScore {
  const bySeat: Record<number, number> = {};
  const byBattlefield: Record<number, Record<number, number>> = {};
  let firstScorerSeat: number | null = null;

  for (const event of sortEvents(events)) {
    const score = parseScorePayload(event);
    if (!score) continue;

    bySeat[score.scorer_seat] = (bySeat[score.scorer_seat] ?? 0) + score.points;

    if (firstScorerSeat === null) {
      firstScorerSeat = score.scorer_seat;
    }

    if (score.battlefield_position != null) {
      const bf = score.battlefield_position;
      if (!byBattlefield[bf]) byBattlefield[bf] = {};
      byBattlefield[bf][score.scorer_seat] =
        (byBattlefield[bf][score.scorer_seat] ?? 0) + score.points;
    }
  }

  return {
    bySeat,
    byBattlefield,
    firstScorerSeat,
    totalEvents: events.filter((e) => e.event_type === 'score').length,
  };
}

export function getMatchSeriesScore(
  games: Array<Pick<Game, 'winner_seat'>>,
): Record<number, number> {
  const wins: Record<number, number> = {};
  for (const game of games) {
    if (game.winner_seat != null) {
      wins[game.winner_seat] = (wins[game.winner_seat] ?? 0) + 1;
    }
  }
  return wins;
}

export function getActiveGame(match: MatchFull): GameWithDetails | null {
  const incomplete = match.games.filter((g) => g.winner_seat == null);
  if (incomplete.length === 0) return null;
  return incomplete[incomplete.length - 1] ?? null;
}

export function useMatchHistory(): UseQueryResult<MatchWithPlayers[]> {
  const { user } = useAuth();

  return useQuery({
    queryKey: gameKeys.matches(user?.id ?? ''),
    queryFn: () => fetchMatchesForUser(user!.id),
    enabled: !!user?.id,
  });
}

export function useMatches(): UseQueryResult<MatchWithPlayers[]> {
  return useMatchHistory();
}

export function useMatch(id: string | undefined): UseQueryResult<MatchFull | null> {
  return useQuery({
    queryKey: gameKeys.match(id ?? ''),
    queryFn: () => fetchMatch(id!),
    enabled: !!id,
  });
}

export function useGameEvents(gameId: string | undefined): UseQueryResult<GameEvent[]> {
  const matchQuery = useQuery({
    queryKey: gameKeys.gameEvents(gameId ?? ''),
    queryFn: () => fetchGameEvents(gameId!),
    enabled: !!gameId,
  });
  return matchQuery;
}

export interface CreateMatchPlayerInput {
  seat: number;
  display_name: string;
  legend_card_id: string;
  domains: string[];
  deck_name?: string;
}

export interface CreateMatchInput {
  match_type: MatchType;
  point_target: number;
  players: [CreateMatchPlayerInput, CreateMatchPlayerInput];
  battlefields: [string, string];
  first_player_seat: number;
}

export function useCreateMatchMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  return useMutation({
    mutationFn: async (input: CreateMatchInput) => {
      if (!userId) throw new Error('Not signed in');

      // owner_id is populated server-side from auth.uid() (column default),
      // so the client never sends it — this makes owner_id == auth.uid() by
      // construction and avoids any client/token mismatch.
      const { data: match, error: matchErr } = await supabase
        .from('matches')
        .insert({
          format: '1v1',
          match_type: input.match_type,
          point_target: input.point_target,
        })
        .select()
        .single();

      if (matchErr) throw new Error(matchErr.message);

      const playerRows = input.players.map((p) => ({
        match_id: match.id,
        seat: p.seat,
        display_name: p.display_name,
        legend_card_id: p.legend_card_id,
        domains: p.domains,
        deck_name: p.deck_name ?? null,
      }));

      const { error: playersErr } = await supabase.from('match_players').insert(playerRows);
      if (playersErr) throw new Error(playersErr.message);

      const { data: game, error: gameErr } = await supabase
        .from('games')
        .insert({
          match_id: match.id,
          game_no: 1,
          first_player_seat: input.first_player_seat,
          point_target: input.point_target,
        })
        .select()
        .single();

      if (gameErr) throw new Error(gameErr.message);

      const bfRows = input.battlefields.map((cardId, i) => ({
        game_id: game.id,
        position: i + 1,
        card_id: cardId,
      }));

      const { error: bfErr } = await supabase.from('game_battlefields').insert(bfRows);
      if (bfErr) throw new Error(bfErr.message);

      const full = await fetchMatch(match.id);
      if (!full) throw new Error('Failed to load created match');
      return full;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.matches(userId) });
    },
  });
}

import type { BufferedScoreEvent } from '@/lib/game-event-buffer';

export interface FlushGameEventsInput {
  gameId: string;
  matchId: string;
  events: BufferedScoreEvent[];
}

export function useFlushGameEventsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FlushGameEventsInput) => {
      if (input.events.length === 0) return;

      const rows = input.events.map((e) => ({
        game_id: input.gameId,
        seq: e.seq,
        turn_no: e.turn_no,
        event_type: e.event_type,
        payload: e.payload,
      }));

      const { error } = await supabase
        .from('game_events')
        .upsert(rows, { onConflict: 'game_id,seq', ignoreDuplicates: true });

      if (error) throw error;
    },
    onSettled: (_data, _err, input) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.match(input.matchId) });
    },
  });
}

export function useEndGameMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  return useMutation({
    mutationFn: async ({
      gameId,
      matchId,
      winnerSeat,
    }: {
      gameId: string;
      matchId: string;
      winnerSeat: number;
    }) => {
      const { data, error } = await supabase
        .from('games')
        .update({ winner_seat: winnerSeat })
        .eq('id', gameId)
        .select()
        .single();

      if (error) throw error;
      return data as Game;
    },
    onSettled: (_data, _err, { matchId }) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.match(matchId) });
      queryClient.invalidateQueries({ queryKey: gameKeys.matches(userId) });
    },
  });
}

export interface StartNextGameInput {
  matchId: string;
  gameNo: number;
  firstPlayerSeat: number;
  pointTarget: number;
  battlefields: [string, string];
}

export function useStartNextGameMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  return useMutation({
    mutationFn: async (input: StartNextGameInput) => {
      const { data: game, error: gameErr } = await supabase
        .from('games')
        .insert({
          match_id: input.matchId,
          game_no: input.gameNo,
          first_player_seat: input.firstPlayerSeat,
          point_target: input.pointTarget,
        })
        .select()
        .single();

      if (gameErr) throw new Error(gameErr.message);

      const bfRows = input.battlefields.map((cardId, i) => ({
        game_id: game.id,
        position: i + 1,
        card_id: cardId,
      }));

      const { error: bfErr } = await supabase.from('game_battlefields').insert(bfRows);
      if (bfErr) throw new Error(bfErr.message);

      const full = await fetchMatch(input.matchId);
      if (!full) throw new Error('Failed to reload match');
      return full;
    },
    onSettled: (_data, _err, input) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.match(input.matchId) });
      queryClient.invalidateQueries({ queryKey: gameKeys.matches(userId) });
    },
  });
}

export function useClaimMatchPlayerMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  return useMutation({
    mutationFn: async (claimToken: string) => {
      if (!userId) throw new Error('Not signed in');

      const { error } = await supabase.rpc('claim_match_player', {
        p_claim_token: claimToken,
      });

      if (error) throw new Error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.matches(userId) });
    },
  });
}

export function buildMatchShareUrl(
  matchId: string,
  seat: number,
  claimToken: string,
  scheme = 'riftbound-tracker',
): string {
  return `${scheme}://match/${matchId}?seat=${seat}&claim=${claimToken}`;
}

export function isMatchOwner(match: Match, userId: string | undefined): boolean {
  return !!userId && match.owner_id === userId;
}
