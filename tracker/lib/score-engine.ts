/**
 * Pure score engine for match tracking.
 *
 * No React, no Supabase, no side effects — folds append-only `game_events`
 * rows into a derived live game state. This is the single place to later add
 * legality checks for audio-inferred events.
 *
 * Rules notes:
 * - The win target is per game (`match_games.target_score`): base 8/11 by
 *   mode plus stacking battlefield "+1 to win" modifiers. Never hardcode 8,
 *   and never clamp scores — they can legally exceed the base target.
 * - Undo is append-only: an `undo` event carries `payload.target_event_id`
 *   and the reducer simply skips undone events (an undo can itself be
 *   undone).
 */

import type {
  EventActor,
  GameEvent,
  GameEventType,
  GameMode,
  MatchGame,
  PlayerRef,
} from './types';

/** Derived live state of a single game, folded from its event log. */
export interface DerivedGameState {
  myScore: number;
  opponentScore: number;
  /** 0 before the first `turn_start` event. */
  turnNumber: number;
  activePlayer: PlayerRef | null;
  /**
   * Battlefield slots ('me' = my battlefield, 'opponent' = theirs) where each
   * actor's once-per-battlefield-per-turn scoring opportunity is consumed
   * (reset on `turn_start`): a score there (conquer/hold) or a draw_instead
   * (the draw WAS that battlefield's score for the turn). Keyed by owner
   * slot — never by card id — because both players can bring the SAME
   * battlefield card (mirror matches). Read from `payload.battlefield_owner`;
   * events without it are not tracked.
   */
  slotsUsedThisTurn: Record<PlayerRef, Set<PlayerRef>>;
  /**
   * Current controller of each battlefield slot (null = uncontrolled, the
   * start-of-game state). A `score_conquer` sets the slot's controller to its
   * actor; a `control_change` event (`payload.new_controller`) adjusts control
   * without scoring (units left, downgraded conquest, manual correction).
   */
  controlBySlot: Record<PlayerRef, PlayerRef | null>;
  /**
   * True once the active player has resolved turn-start holds this turn —
   * any non-undone `score_hold` or `hold_skipped` since the last `turn_start`.
   * Drives the one-tap hold prompt (reset each turn).
   */
  holdDecidedThisTurn: boolean;
  /** Ids of events cancelled via `undo` (includes undone `undo` events). */
  undoneEventIds: Set<string>;
  /** True when either score has reached the target. */
  isOver: boolean;
}

/**
 * Base win target for a game mode. Game setup pre-fills
 * `match_games.target_score` with this; the user bumps it per battlefield
 * modifier.
 */
export function baseTargetScore(gameMode: GameMode): number {
  switch (gameMode) {
    case '1v1':
      return 8;
    case '2v2':
      return 11;
    case 'ffa':
      // FFA scoring rules TBD; fall back to the 1v1 target.
      return 8;
  }
}

/**
 * Resolve which event ids are undone.
 *
 * `undo` events target strictly earlier events. Processing undos in reverse
 * `seq` order and skipping any undo whose own id is already undone handles
 * chains correctly (undoing an undo reinstates the original event).
 */
function collectUndoneEventIds(sortedEvents: GameEvent[]): Set<string> {
  const undone = new Set<string>();
  for (let i = sortedEvents.length - 1; i >= 0; i--) {
    const event = sortedEvents[i];
    if (event.event_type !== 'undo') continue;
    if (undone.has(event.id)) continue; // this undo was itself undone
    const target = event.payload['target_event_id'];
    if (typeof target === 'string') undone.add(target);
  }
  return undone;
}

/**
 * Fold an event log (any order; sorted by `seq` internally) into the current
 * game state. Undone events are skipped entirely. Scores are never clamped.
 */
export function deriveGameState(
  events: GameEvent[],
  targetScore: number,
): DerivedGameState {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const undoneEventIds = collectUndoneEventIds(sorted);

  let myScore = 0;
  let opponentScore = 0;
  let turnNumber = 0;
  let activePlayer: PlayerRef | null = null;
  let holdDecidedThisTurn = false;
  let slotsUsedThisTurn: Record<PlayerRef, Set<PlayerRef>> = {
    me: new Set<PlayerRef>(),
    opponent: new Set<PlayerRef>(),
  };
  const controlBySlot: Record<PlayerRef, PlayerRef | null> = {
    me: null,
    opponent: null,
  };

  for (const event of sorted) {
    if (undoneEventIds.has(event.id)) continue;

    switch (event.event_type) {
      case 'turn_start': {
        turnNumber += 1;
        const active = event.payload['active_player'];
        if (active === 'me' || active === 'opponent') activePlayer = active;
        slotsUsedThisTurn = {
          me: new Set<PlayerRef>(),
          opponent: new Set<PlayerRef>(),
        };
        holdDecidedThisTurn = false;
        break;
      }
      case 'score_conquer':
      case 'score_hold':
      case 'score_effect': {
        if (event.actor !== 'me' && event.actor !== 'opponent') break;
        if (event.actor === 'me') myScore += event.points;
        else opponentScore += event.points;
        const owner = event.payload['battlefield_owner'];
        if (owner === 'me' || owner === 'opponent') {
          slotsUsedThisTurn[event.actor].add(owner);
          if (event.event_type === 'score_conquer') {
            controlBySlot[owner] = event.actor;
          }
        }
        if (event.event_type === 'score_hold') holdDecidedThisTurn = true;
        break;
      }
      case 'draw_instead': {
        // The draw consumes that battlefield's score for the turn.
        if (event.actor !== 'me' && event.actor !== 'opponent') break;
        const owner = event.payload['battlefield_owner'];
        if (owner === 'me' || owner === 'opponent') {
          slotsUsedThisTurn[event.actor].add(owner);
        }
        break;
      }
      case 'control_change': {
        const owner = event.payload['battlefield_owner'];
        const next = event.payload['new_controller'];
        if (owner === 'me' || owner === 'opponent') {
          controlBySlot[owner] = next === 'me' || next === 'opponent' ? next : null;
        }
        break;
      }
      case 'hold_skipped':
        holdDecidedThisTurn = true;
        break;
      // game_start, undo, note, game_end (and unknown future types) do not
      // affect derived scores.
      default:
        break;
    }
  }

  return {
    myScore,
    opponentScore,
    turnNumber,
    activePlayer,
    slotsUsedThisTurn,
    controlBySlot,
    holdDecidedThisTurn,
    undoneEventIds,
    isOver: myScore >= targetScore || opponentScore >= targetScore,
  };
}

/**
 * Battlefield slots the active player would score turn-start holds on: slots
 * they control and have not already scored from this turn. Empty when control
 * is untracked (both slots null) or it's nobody's turn yet.
 */
export function holdableSlots(state: DerivedGameState): PlayerRef[] {
  const active = state.activePlayer;
  if (!active) return [];
  const slots: PlayerRef[] = [];
  for (const slot of ['me', 'opponent'] as const) {
    if (state.controlBySlot[slot] === active && !state.slotsUsedThisTurn[active].has(slot)) {
      slots.push(slot);
    }
  }
  return slots;
}

/** Next client-assigned sequence number (1 for an empty log). */
export function nextSeq(events: GameEvent[]): number {
  let max = 0;
  for (const event of events) {
    if (event.seq > max) max = event.seq;
  }
  return max + 1;
}

export interface BuildEventParams {
  /** Client-generated uuid (pass `Crypto.randomUUID()`; kept as a param so this module stays pure). */
  id: string;
  gameId: string;
  userId: string;
  /** Existing event log for the game; `seq` is assigned via {@link nextSeq}. */
  events: GameEvent[];
  turnNumber: number;
  actor: EventActor;
  eventType: GameEventType | (string & {});
  battlefieldCardId?: string | null;
  points?: number;
  payload?: Record<string, unknown>;
}

/** Build a `game_events` row, assigning seq and timestamps. */
export function buildEvent(params: BuildEventParams): GameEvent {
  const now = new Date().toISOString();
  return {
    id: params.id,
    game_id: params.gameId,
    user_id: params.userId,
    seq: nextSeq(params.events),
    turn_number: params.turnNumber,
    actor: params.actor,
    event_type: params.eventType,
    battlefield_card_id: params.battlefieldCardId ?? null,
    points: params.points ?? 0,
    payload: params.payload ?? {},
    occurred_at: now,
    created_at: now,
  };
}

/** What recording a conquest by `actor` on `slot` does, per the scoring rules. */
export type ConquerOutcome = 'score' | 'draw' | 'control_only';

/**
 * Resolve a conquest by `actor` on `slot` against the scoring rules — the
 * single source of truth for both tap handling and tile hints:
 *
 * 1. `control_only` — once-per-battlefield-per-turn: the actor already used
 *    this slot's score this turn (scored or drew there). Control still flips;
 *    no point, no draw.
 * 2. `draw` — final-point rule: the winning point may only come from a hold
 *    or from scoring on BOTH battlefields in the same turn. A lone conquer at
 *    match point records a draw instead (and still flips control); conquering
 *    the other battlefield later the same turn then scores.
 * 3. `score` — otherwise, +1.
 *
 * `targetScore` is the game row's `target_score` (base by mode + battlefield
 * modifiers) — never a constant.
 */
export function conquerOutcome(
  state: DerivedGameState,
  actor: PlayerRef,
  slot: PlayerRef,
  targetScore: number,
): ConquerOutcome {
  const used = state.slotsUsedThisTurn[actor];
  if (used.has(slot)) return 'control_only';
  const otherSlot: PlayerRef = slot === 'me' ? 'opponent' : 'me';
  if (wouldReachTarget(state, actor, 1, targetScore) && !used.has(otherSlot)) {
    return 'draw';
  }
  return 'score';
}

/**
 * Soft warning for the final-point rule: true if scoring `points` would put
 * the actor at or past the target.
 */
export function wouldReachTarget(
  state: DerivedGameState,
  actor: PlayerRef,
  points: number,
  targetScore: number,
): boolean {
  const current = actor === 'me' ? state.myScore : state.opponentScore;
  return current + points >= targetScore;
}

/**
 * Battlefields already used by each player across the games of a match
 * (excluding abandoned games), for the Bo3 no-reuse rule.
 */
export function usedBattlefieldIds(games: MatchGame[]): {
  me: Set<string>;
  opponent: Set<string>;
} {
  const me = new Set<string>();
  const opponent = new Set<string>();
  for (const game of games) {
    if (game.status === 'abandoned') continue;
    if (game.my_battlefield_card_id) me.add(game.my_battlefield_card_id);
    if (game.opponent_battlefield_card_id) {
      opponent.add(game.opponent_battlefield_card_id);
    }
  }
  return { me, opponent };
}
