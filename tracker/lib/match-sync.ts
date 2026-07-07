/**
 * Supabase sync layer for the local-first match store.
 *
 * Checkpoints (all invoked by lib/match-store.ts actions):
 * - startMatch / startGame / endGame / endMatch / abandonMatch → syncNow()
 * - appendEvent → scheduleEventFlush() (debounced ~2 s batch upsert of
 *   events with seq > lastSyncedSeqByGameId)
 *
 * Every write is an upsert-by-id (see lib/queries.ts sync fns), so retries
 * are harmless. Sync never throws into the UI and never blocks tracking:
 * failures leave the dirty flags in place and set sync.lastError; the next
 * checkpoint — or an explicit retrySync() (e.g. on screen focus / an
 * "unsynced" indicator tap) — retries everything still dirty.
 *
 * After the final flush of a completed/abandoned match succeeds, the
 * AsyncStorage slot is cleared and the matches query is invalidated (call
 * setMatchSyncQueryClient once at app startup to enable invalidation).
 *
 * Dependency direction: match-sync imports from queries.ts, never the other
 * way around. match-store ↔ match-sync is a deliberate runtime-only cycle.
 */

import type { QueryClient } from '@tanstack/react-query';

import {
  clearActiveMatch,
  getActiveMatchState,
  hasDirtyWork,
  markEventsSynced,
  markGameSynced,
  markMatchSynced,
  persistNow,
  setSyncError,
  type ActiveMatchState,
} from '@/lib/match-store';
import {
  insertMatch,
  queryKeys,
  upsertGameEvents,
  upsertMatchGame,
} from '@/lib/queries';

const EVENT_FLUSH_DEBOUNCE_MS = 2000;

let queryClient: QueryClient | null = null;

/**
 * Register the app's QueryClient so the matches query can be invalidated
 * after a match's final flush. Call once (e.g. in the root layout).
 */
export function setMatchSyncQueryClient(client: QueryClient): void {
  queryClient = client;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let rerunRequested = false;
let summaryScreenVisible = false;

/**
 * The match-summary screen registers its visibility (mount/unmount) so a
 * flush finishing in the background never yanks it out from under the user;
 * its Done button owns the clear while it is showing. Once the user has
 * navigated away, finalizeIfDone may drop the slot after a successful retry.
 */
export function setSummaryScreenVisible(visible: boolean): void {
  summaryScreenVisible = visible;
}

/** Debounced flush after appendEvent — batches rapid taps into one upsert. */
export function scheduleEventFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void runFlush();
  }, EVENT_FLUSH_DEBOUNCE_MS);
}

/**
 * Immediate flush of everything dirty. Never throws (safe to fire-and-forget
 * or best-effort await). Persists to AsyncStorage first so the server can
 * never get ahead of local storage.
 */
export async function syncNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await persistNow();
  await runFlush();
}

/** Retry a previously failed sync (screen focus, "unsynced" indicator, …). */
export function retrySync(): void {
  void syncNow();
}

async function runFlush(): Promise<void> {
  if (inFlight) {
    // A flush is running against an older snapshot; run again afterwards.
    rerunRequested = true;
    return;
  }
  inFlight = true;
  try {
    await flushOnce();
  } catch (error) {
    // flushOnce reports its own errors; this guard keeps sync from ever
    // throwing into the UI.
    setSyncError(error instanceof Error ? error.message : 'Sync failed');
  } finally {
    inFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      void runFlush();
    }
  }
}

async function flushOnce(): Promise<void> {
  // Work against a snapshot captured up front; the store can be replaced
  // (new match started) or cleared while a network call is in flight. Bail
  // after every await if the store no longer owns the captured match — the
  // mark-synced mutators are id-scoped too, but bailing avoids wasted writes
  // and stale error reporting.
  const state = getActiveMatchState();
  if (!state) return;
  const capturedMatchId = state.match.id;
  const matchChanged = () => getActiveMatchState()?.match.id !== capturedMatchId;

  try {
    // Order matters for FKs: match → games → events.
    if (state.sync.dirtyMatch) {
      await insertMatch(state.match);
      if (matchChanged()) return;
      markMatchSynced(capturedMatchId, state.match);
    }

    for (const gameId of state.sync.dirtyGameIds) {
      const game = state.games.find((g) => g.id === gameId) ?? null;
      if (!game) {
        markGameSynced(gameId, capturedMatchId, null); // stale flag; nothing to write
        continue;
      }
      await upsertMatchGame(game);
      if (matchChanged()) return;
      markGameSynced(gameId, capturedMatchId, game);
    }

    for (const game of state.games) {
      const events = state.eventsByGameId[game.id] ?? [];
      const lastSynced = state.sync.lastSyncedSeqByGameId[game.id] ?? 0;
      const pending = events.filter((event) => event.seq > lastSynced);
      if (pending.length === 0) continue;
      await upsertGameEvents(pending);
      if (matchChanged()) return;
      markEventsSynced(
        game.id,
        Math.max(...pending.map((event) => event.seq)),
        capturedMatchId,
      );
    }
  } catch (error) {
    // Leave remaining dirty flags in place; retried at the next checkpoint
    // or via retrySync(). Don't report onto a different match's state.
    if (matchChanged()) return;
    setSyncError(error instanceof Error ? error.message : 'Sync failed');
    return;
  }

  finalizeIfDone(state);
}

/**
 * When the match has ended (completed/abandoned) and nothing is dirty, the
 * server copy is complete: refresh match history and — unless the user is
 * still looking at the match summary (its Done button clears) — drop the
 * local slot. Checked against the *current* store state, not the snapshot
 * the flush started from, so anything appended mid-flush blocks
 * finalization until the next flush.
 */
function finalizeIfDone(captured: ActiveMatchState): void {
  const state = getActiveMatchState();

  if (!state || state.match.id !== captured.match.id) {
    // The slot was cleared (Done pressed mid-flush) or replaced. If the
    // captured match had ended, its final rows just landed — refresh history.
    if (captured.match.status !== 'in_progress') {
      invalidateMatchQueries(captured.match.user_id, captured.match.id);
    }
    return;
  }

  if (state.match.status === 'in_progress') return;
  if (hasDirtyWork(state)) return;

  const { user_id: userId, id: matchId } = state.match;
  // Never yank the summary screen while it's showing: its Done handler
  // clears the slot. Once the user has left it, clear here (covers a match
  // that stayed dirty at Done time and synced via a later retry).
  if (!summaryScreenVisible) clearActiveMatch();
  invalidateMatchQueries(userId, matchId);
}

function invalidateMatchQueries(userId: string, matchId: string): void {
  if (!queryClient) return;
  // Prefix-matches the games sub-key used by useMatchGamesQuery too.
  void queryClient.invalidateQueries({ queryKey: queryKeys.matches(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.matchDetail(matchId) });
}
