/**
 * Local-first live match store.
 *
 * Mirrors the `useSyncExternalStore` pattern from lib/browser-store.ts, plus
 * AsyncStorage persistence so an app restart mid-game restores exactly.
 * AsyncStorage is the source of truth while a match is active; Supabase is
 * written at checkpoints by lib/match-sync.ts (which this module calls —
 * the two modules are intentionally co-dependent, but only at call time, so
 * the require cycle is harmless).
 *
 * State is JSON-safe (no Sets/Maps/Dates). Derived values (live scores, turn,
 * once-per-turn tracking) come from lib/score-engine.ts, never stored.
 *
 * The store has no React-context access, so actions that create rows
 * (startMatch) take the userId as a param — screens pass it from useAuth().
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { retrySync, scheduleEventFlush, syncNow } from '@/lib/match-sync';
import {
  buildEvent,
  deriveGameState,
  type DerivedGameState,
} from '@/lib/score-engine';
import type {
  EventActor,
  GameEvent,
  GameEventType,
  GameMode,
  GameWinner,
  Match,
  MatchFormat,
  MatchGame,
  MatchResult,
  PlayerRef,
} from '@/lib/types';

const STORAGE_KEY = 'active_match_v1';
const PERSIST_DEBOUNCE_MS = 300;

export type MatchPhase = 'game_setup' | 'live' | 'game_summary' | 'match_summary';

export interface ActiveMatchSyncState {
  /** Match row needs (re-)upserting. */
  dirtyMatch: boolean;
  /** Game rows needing (re-)upserting. */
  dirtyGameIds: string[];
  /** Highest event `seq` per game confirmed written to Supabase. */
  lastSyncedSeqByGameId: Record<string, number>;
  /** Last sync failure message; null when the last attempt succeeded. */
  lastError: string | null;
}

export interface ActiveMatchState {
  match: Match;
  games: MatchGame[];
  eventsByGameId: Record<string, GameEvent[]>;
  phase: MatchPhase;
  /** Set while a game is live; after endGame it keeps pointing at the last game. */
  currentGameId: string | null;
  /** Starting player chosen at match creation; prefills game-1 setup. */
  pendingStartingPlayer: PlayerRef | null;
  sync: ActiveMatchSyncState;
}

export interface MatchStoreSnapshot {
  /** False until the AsyncStorage restore attempt finishes. */
  isHydrated: boolean;
  state: ActiveMatchState | null;
}

/* ------------------------------------------------------------------ */
/* External store plumbing                                             */
/* ------------------------------------------------------------------ */

let snapshot: MatchStoreSnapshot = { isHydrated: false, state: null };
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): MatchStoreSnapshot {
  return snapshot;
}

/** Current active-match state (or null). For match-sync and imperative code. */
export function getActiveMatchState(): ActiveMatchState | null {
  return snapshot.state;
}

export function useMatchStore(): MatchStoreSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function setState(state: ActiveMatchState | null) {
  snapshot = { ...snapshot, state };
  emitChange();
  schedulePersist();
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Cancel the persist debounce and write AsyncStorage immediately. match-sync
 * awaits this before flushing so the server can never get ahead of local
 * storage (a kill mid-debounce would otherwise leave the stored copy behind
 * the server's seq high-water mark).
 */
export async function persistNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    if (snapshot.state === null) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.state));
    }
  } catch {
    // Persistence is best-effort; in-memory state stays authoritative.
  }
}

async function hydrate(): Promise<void> {
  let restored: ActiveMatchState | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ActiveMatchState;
      if (parsed && typeof parsed === 'object' && parsed.match?.id) {
        restored = parsed;
      }
    }
  } catch {
    // Corrupt/unreadable slot — start clean.
  }
  // Never clobber a match started before hydration finished.
  snapshot = { isHydrated: true, state: snapshot.state ?? restored };
  emitChange();
  // Restored state may hold work that never reached Supabase (the app was
  // killed before a flush completed) — retry immediately.
  if (snapshot.state && hasDirtyWork(snapshot.state)) retrySync();
}

void hydrate();

/* ------------------------------------------------------------------ */
/* Selectors / helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * True when anything has not been confirmed written to Supabase: a dirty
 * match row, dirty game rows, or events past a game's synced-seq high-water
 * mark.
 */
export function hasDirtyWork(state: ActiveMatchState): boolean {
  if (state.sync.dirtyMatch || state.sync.dirtyGameIds.length > 0) return true;
  for (const game of state.games) {
    const events = state.eventsByGameId[game.id] ?? [];
    const lastSynced = state.sync.lastSyncedSeqByGameId[game.id] ?? 0;
    if (events.some((event) => event.seq > lastSynced)) return true;
  }
  return false;
}

export function getCurrentGame(state: ActiveMatchState | null): MatchGame | null {
  if (!state?.currentGameId) return null;
  return state.games.find((game) => game.id === state.currentGameId) ?? null;
}

/**
 * Derived live state (scores, turn, once-per-turn sets) of the current game,
 * via the score engine. Recompute after every store change — cheap.
 */
export function deriveCurrentGameState(): DerivedGameState | null {
  const state = snapshot.state;
  const game = getCurrentGame(state);
  if (!state || !game) return null;
  return deriveGameState(state.eventsByGameId[game.id] ?? [], game.target_score);
}

/** Completed-game win tallies for a match. */
export function countGameWins(games: MatchGame[]): {
  me: number;
  opponent: number;
  draws: number;
} {
  let me = 0;
  let opponent = 0;
  let draws = 0;
  for (const game of games) {
    if (game.status !== 'completed') continue;
    if (game.winner === 'me') me++;
    else if (game.winner === 'opponent') opponent++;
    else if (game.winner === 'draw') draws++;
  }
  return { me, opponent, draws };
}

function isMatchDecided(format: MatchFormat, games: MatchGame[]): boolean {
  const completed = games.filter((game) => game.status === 'completed').length;
  if (format === 'bo1') return completed >= 1;
  const wins = countGameWins(games);
  return wins.me >= 2 || wins.opponent >= 2 || completed >= 3;
}

/** State + live game + events, or null if no game is currently in progress. */
function requireLiveGame(): {
  state: ActiveMatchState;
  game: MatchGame;
  events: GameEvent[];
  derived: DerivedGameState;
} | null {
  const state = snapshot.state;
  const game = getCurrentGame(state);
  if (!state || !game || game.status !== 'in_progress') return null;
  const events = state.eventsByGameId[game.id] ?? [];
  return { state, game, events, derived: deriveGameState(events, game.target_score) };
}

function pushEvent(state: ActiveMatchState, gameId: string, event: GameEvent): void {
  setState({
    ...state,
    eventsByGameId: {
      ...state.eventsByGameId,
      [gameId]: [...(state.eventsByGameId[gameId] ?? []), event],
    },
  });
  scheduleEventFlush();
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export interface StartMatchParams {
  /** From useAuth() — the store has no React-context access. */
  userId: string;
  format: MatchFormat;
  gameMode: GameMode;
  myLegendCardId: string | null;
  opponentLegendCardId: string | null;
  myDeckName?: string | null;
  opponentDeckName?: string | null;
  /** Optional "decide later"; prefills game-1 setup. */
  startingPlayer?: PlayerRef | null;
}

/**
 * Create the match (replacing any previous active-match state) and enter
 * `game_setup`. Returns the new match (screens navigate to /match/{id}).
 */
export function startMatch(params: StartMatchParams): Match {
  const now = new Date().toISOString();
  const match: Match = {
    id: Crypto.randomUUID(),
    user_id: params.userId,
    format: params.format,
    game_mode: params.gameMode,
    my_legend_card_id: params.myLegendCardId,
    opponent_legend_card_id: params.opponentLegendCardId,
    my_deck_name: params.myDeckName ?? null,
    opponent_deck_name: params.opponentDeckName ?? null,
    status: 'in_progress',
    result: null,
    notes: null,
    started_at: now,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };

  setState({
    match,
    games: [],
    eventsByGameId: {},
    phase: 'game_setup',
    currentGameId: null,
    pendingStartingPlayer: params.startingPlayer ?? null,
    sync: {
      dirtyMatch: true,
      dirtyGameIds: [],
      lastSyncedSeqByGameId: {},
      lastError: null,
    },
  });
  syncNow();
  return match;
}

export interface StartGameParams {
  /** Defaults to the match-level pending starting player, then 'me'. */
  startingPlayer?: PlayerRef;
  /** Pre-fill with baseTargetScore(gameMode) + battlefield modifiers. */
  targetScore: number;
  myBattlefieldCardId?: string | null;
  opponentBattlefieldCardId?: string | null;
  myMulliganCount?: number | null;
  opponentMulliganCount?: number | null;
  sideNotes?: string | null;
}

/**
 * Create the next game (`game_start` + first `turn_start` events) and go
 * live. No-op (returns null) if there is no active match or a game is
 * already in progress.
 */
export function startGame(params: StartGameParams): MatchGame | null {
  const state = snapshot.state;
  if (!state) return null;
  if (state.games.some((game) => game.status === 'in_progress')) return null;

  const now = new Date().toISOString();
  const startingPlayer = params.startingPlayer ?? state.pendingStartingPlayer ?? 'me';
  const game: MatchGame = {
    id: Crypto.randomUUID(),
    match_id: state.match.id,
    user_id: state.match.user_id,
    game_number: state.games.length + 1,
    starting_player: startingPlayer,
    my_battlefield_card_id: params.myBattlefieldCardId ?? null,
    opponent_battlefield_card_id: params.opponentBattlefieldCardId ?? null,
    my_mulligan_count: params.myMulliganCount ?? null,
    opponent_mulligan_count: params.opponentMulliganCount ?? null,
    side_notes: params.sideNotes ?? null,
    target_score: params.targetScore,
    status: 'in_progress',
    my_score: 0,
    opponent_score: 0,
    winner: null,
    started_at: now,
    ended_at: null,
  };

  const events: GameEvent[] = [];
  events.push(
    buildEvent({
      id: Crypto.randomUUID(),
      gameId: game.id,
      userId: game.user_id,
      events,
      turnNumber: 0,
      actor: 'system',
      eventType: 'game_start',
    }),
  );
  events.push(
    buildEvent({
      id: Crypto.randomUUID(),
      gameId: game.id,
      userId: game.user_id,
      events,
      turnNumber: 1,
      actor: startingPlayer,
      eventType: 'turn_start',
      payload: { active_player: startingPlayer },
    }),
  );

  setState({
    ...state,
    games: [...state.games, game],
    eventsByGameId: { ...state.eventsByGameId, [game.id]: events },
    phase: 'live',
    currentGameId: game.id,
    pendingStartingPlayer: null,
    sync: {
      ...state.sync,
      dirtyGameIds: [...state.sync.dirtyGameIds, game.id],
      lastSyncedSeqByGameId: { ...state.sync.lastSyncedSeqByGameId, [game.id]: 0 },
    },
  });
  syncNow();
  return game;
}

export interface AppendEventParams {
  actor: EventActor;
  eventType: GameEventType | (string & {});
  battlefieldCardId?: string | null;
  points?: number;
  payload?: Record<string, unknown>;
}

/**
 * Append an event to the live game (score_conquer / score_hold /
 * score_effect / draw_instead / note / …). Returns the event, or null when
 * no game is live.
 */
export function appendEvent(params: AppendEventParams): GameEvent | null {
  const live = requireLiveGame();
  if (!live) return null;

  const event = buildEvent({
    id: Crypto.randomUUID(),
    gameId: live.game.id,
    userId: live.state.match.user_id,
    events: live.events,
    turnNumber: live.derived.turnNumber,
    actor: params.actor,
    eventType: params.eventType,
    battlefieldCardId: params.battlefieldCardId,
    points: params.points,
    payload: params.payload,
  });
  pushEvent(live.state, live.game.id, event);
  return event;
}

/** Append a `turn_start` event with the active player flipped. */
export function advanceTurn(): GameEvent | null {
  const live = requireLiveGame();
  if (!live) return null;

  const previousActive =
    live.derived.activePlayer ?? live.game.starting_player ?? 'me';
  const nextActive: PlayerRef = previousActive === 'me' ? 'opponent' : 'me';

  const event = buildEvent({
    id: Crypto.randomUUID(),
    gameId: live.game.id,
    userId: live.state.match.user_id,
    events: live.events,
    turnNumber: live.derived.turnNumber + 1,
    actor: nextActive,
    eventType: 'turn_start',
    payload: { active_player: nextActive },
  });
  pushEvent(live.state, live.game.id, event);
  return event;
}

/**
 * Append-only undo: targets the last non-undone, non-undo event via
 * `payload.target_event_id`. Returns the undo event, or null if nothing is
 * undoable.
 */
export function undoLastEvent(): GameEvent | null {
  const live = requireLiveGame();
  if (!live) return null;

  const targetEvent = [...live.events]
    .sort((a, b) => b.seq - a.seq)
    .find(
      (event) =>
        event.event_type !== 'undo' && !live.derived.undoneEventIds.has(event.id),
    );
  if (!targetEvent) return null;

  const event = buildEvent({
    id: Crypto.randomUUID(),
    gameId: live.game.id,
    userId: live.state.match.user_id,
    events: live.events,
    turnNumber: live.derived.turnNumber,
    actor: 'system',
    eventType: 'undo',
    payload: { target_event_id: targetEvent.id },
  });
  pushEvent(live.state, live.game.id, event);
  return event;
}

/**
 * End the live game: writes derived final scores + winner onto the game row,
 * appends a `game_end` event, and moves to `game_summary` — or straight to
 * `match_summary` when the match is decided (bo1, two game wins, or three
 * games done). Call endMatch() from the summary to finalize the match.
 */
export function endGame(winner: GameWinner): void {
  const live = requireLiveGame();
  if (!live) return;
  const { state, game, events, derived } = live;

  const now = new Date().toISOString();
  const endEvent = buildEvent({
    id: Crypto.randomUUID(),
    gameId: game.id,
    userId: state.match.user_id,
    events,
    turnNumber: derived.turnNumber,
    actor: 'system',
    eventType: 'game_end',
    payload: { winner },
  });

  const updatedGame: MatchGame = {
    ...game,
    status: 'completed',
    my_score: derived.myScore,
    opponent_score: derived.opponentScore,
    winner,
    ended_at: now,
  };
  const games = state.games.map((g) => (g.id === game.id ? updatedGame : g));

  setState({
    ...state,
    games,
    eventsByGameId: {
      ...state.eventsByGameId,
      [game.id]: [...events, endEvent],
    },
    phase: isMatchDecided(state.match.format, games) ? 'match_summary' : 'game_summary',
    sync: {
      ...state.sync,
      dirtyGameIds: state.sync.dirtyGameIds.includes(game.id)
        ? state.sync.dirtyGameIds
        : [...state.sync.dirtyGameIds, game.id],
    },
  });
  syncNow();
}

/**
 * Finalize the match: result from game wins, status completed. On successful
 * final sync, match-sync clears the AsyncStorage slot and invalidates the
 * matches query (the detail screen then falls back to useMatchDetailQuery).
 */
export function endMatch(notes?: string): void {
  const state = snapshot.state;
  if (!state) return;

  const wins = countGameWins(state.games);
  const result: MatchResult =
    wins.me > wins.opponent ? 'win' : wins.opponent > wins.me ? 'loss' : 'draw';
  const now = new Date().toISOString();

  setState({
    ...state,
    match: {
      ...state.match,
      status: 'completed',
      result,
      notes: notes !== undefined ? notes : state.match.notes,
      completed_at: now,
      updated_at: now,
    },
    phase: 'match_summary',
    sync: { ...state.sync, dirtyMatch: true },
  });
  syncNow();
}

/**
 * Abandon the match (and any in-progress game) and flush. On successful
 * flush, match-sync clears the local slot; on failure the state stays for
 * retrySync() — call clearActiveMatch() to force-discard.
 */
export function abandonMatch(): void {
  const state = snapshot.state;
  if (!state) return;

  const now = new Date().toISOString();
  const abandonedGameIds: string[] = [];
  const games = state.games.map((game) => {
    if (game.status !== 'in_progress') return game;
    abandonedGameIds.push(game.id);
    return { ...game, status: 'abandoned' as const, ended_at: now };
  });

  const dirtyGameIds = [...state.sync.dirtyGameIds];
  for (const id of abandonedGameIds) {
    if (!dirtyGameIds.includes(id)) dirtyGameIds.push(id);
  }

  setState({
    ...state,
    match: { ...state.match, status: 'abandoned', completed_at: now, updated_at: now },
    games,
    phase: 'match_summary',
    sync: { ...state.sync, dirtyMatch: true, dirtyGameIds },
  });
  syncNow();
}

/**
 * Drop the active match from memory and AsyncStorage. Called by match-sync
 * after the final successful flush; also usable to discard unsynced state.
 */
export function clearActiveMatch(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  snapshot = { ...snapshot, state: null };
  emitChange();
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Sync-state mutators (for lib/match-sync.ts only)                    */
/* ------------------------------------------------------------------ */

/**
 * Clear the match dirty flag — only when the store still owns `matchId` AND
 * the current match row is exactly the row that was written (`syncedRow`).
 * If the row changed mid-flight it stays dirty so the rerun re-flushes the
 * newer copy.
 */
export function markMatchSynced(matchId: string, syncedRow: Match): void {
  const state = snapshot.state;
  if (!state || state.match.id !== matchId) return;
  if (JSON.stringify(state.match) !== JSON.stringify(syncedRow)) return;
  setState({ ...state, sync: { ...state.sync, dirtyMatch: false, lastError: null } });
}

/**
 * Clear a game's dirty flag — only when the store still owns `matchId` AND
 * the current copy of the game equals the written row. `syncedRow` null is
 * the stale-flag case (no such game): clear only if it is still absent.
 */
export function markGameSynced(
  gameId: string,
  matchId: string,
  syncedRow: MatchGame | null,
): void {
  const state = snapshot.state;
  if (!state || state.match.id !== matchId) return;
  const current = state.games.find((game) => game.id === gameId) ?? null;
  if (JSON.stringify(current) !== JSON.stringify(syncedRow)) return;
  setState({
    ...state,
    sync: {
      ...state.sync,
      dirtyGameIds: state.sync.dirtyGameIds.filter((id) => id !== gameId),
      lastError: null,
    },
  });
}

/**
 * Raise a game's synced-seq high-water mark. No-op when the store no longer
 * owns `matchId`; otherwise monotonic-safe (events are append-only and the
 * mark only ever moves up).
 */
export function markEventsSynced(gameId: string, throughSeq: number, matchId: string): void {
  const state = snapshot.state;
  if (!state || state.match.id !== matchId) return;
  const current = state.sync.lastSyncedSeqByGameId[gameId] ?? 0;
  setState({
    ...state,
    sync: {
      ...state.sync,
      lastSyncedSeqByGameId: {
        ...state.sync.lastSyncedSeqByGameId,
        [gameId]: Math.max(current, throughSeq),
      },
      lastError: null,
    },
  });
}

export function setSyncError(message: string): void {
  const state = snapshot.state;
  if (!state) return;
  setState({ ...state, sync: { ...state.sync, lastError: message } });
}
