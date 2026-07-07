/** Database row types mirroring supabase/migrations/0001_init.sql */

export type CollectionGoal =
  | 'single_separate'
  | 'playset_separate'
  | 'playset_normal'
  | 'playset_foil'
  | 'single_combined'
  | 'playset_combined';

export const DEFAULT_COLLECTION_GOAL: CollectionGoal = 'playset_separate';

export function isValidCollectionGoal(value: unknown): value is CollectionGoal {
  return (
    value === 'single_separate' ||
    value === 'playset_separate' ||
    value === 'playset_normal' ||
    value === 'playset_foil' ||
    value === 'single_combined' ||
    value === 'playset_combined'
  );
}

export interface Set {
  id: string;
  label: string;
  max_collector_number: number | null;
}

export interface Card {
  id: string;
  collector_number: string | null;
  name: string;
  set_id: string;
  set_name: string;
  public_code: string | null;
  card_type: string | null;
  super_type: string | null;
  rarity_id: string | null;
  rarity_label: string | null;
  energy: number | null;
  might: number | null;
  power: number | null;
  might_bonus: string | null;
  orientation: string | null;
  illustrator: string | null;
  ability_html: string | null;
  ability_text: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_width: number | null;
  image_height: number | null;
}

export interface CardDomain {
  card_id: string;
  domain_id: string;
  domain_label: string;
}

export interface CardTag {
  card_id: string;
  tag: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  collection_goal: CollectionGoal;
  created_at: string;
}

export interface UserCard {
  user_id: string;
  card_id: string;
  quantity_owned: number;
  quantity_owned_foil: number;
  for_sale_count: number;
  notes: string | null;
  updated_at: string;
}

export interface WishlistItem {
  user_id: string;
  card_id: string;
  created_at: string;
}

/** Card with joined reference data (used in browse/detail views). */
export interface CardWithMeta extends Card {
  domains?: CardDomain[];
  tags?: CardTag[];
}

/** User card merged with card reference data (used in collection views). */
export interface UserCardWithCard extends UserCard {
  card: Card;
}

/** Wishlist row merged with card reference data. */
export interface WishlistItemWithCard extends WishlistItem {
  card: Card;
}

/* ------------------------------------------------------------------ */
/* Match / score tracking (mirrors supabase/migrations/0007_matches.sql) */
/* ------------------------------------------------------------------ */

export type PlayerRef = 'me' | 'opponent';

export type MatchFormat = 'bo1' | 'bo3';

export type GameMode = '1v1' | '2v2' | 'ffa';

export type MatchStatus = 'in_progress' | 'completed' | 'abandoned';

export type MatchResult = 'win' | 'loss' | 'draw';

export type GameWinner = 'me' | 'opponent' | 'draw';

export type EventActor = PlayerRef | 'system';

/**
 * Known event types. The `game_events.event_type` column has no SQL check so
 * future (e.g. audio-inferred) types can appear without a migration; row
 * interfaces therefore type the column as `GameEventType | (string & {})`.
 */
export type GameEventType =
  | 'game_start'
  | 'turn_start'
  | 'score_conquer'
  | 'score_hold'
  | 'score_effect'
  | 'draw_instead'
  | 'control_change'
  | 'hold_skipped'
  | 'undo'
  | 'note'
  | 'game_end';

const GAME_EVENT_TYPES: readonly GameEventType[] = [
  'game_start',
  'turn_start',
  'score_conquer',
  'score_hold',
  'score_effect',
  'draw_instead',
  'control_change',
  'hold_skipped',
  'undo',
  'note',
  'game_end',
];

export function isValidGameEventType(value: unknown): value is GameEventType {
  return (
    typeof value === 'string' &&
    (GAME_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export interface Match {
  id: string;
  user_id: string;
  format: MatchFormat;
  game_mode: GameMode;
  my_legend_card_id: string | null;
  /** Nullable = opponent legend unknown. */
  opponent_legend_card_id: string | null;
  my_deck_name: string | null;
  opponent_deck_name: string | null;
  status: MatchStatus;
  result: MatchResult | null;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchGame {
  id: string;
  match_id: string;
  user_id: string;
  game_number: number;
  starting_player: PlayerRef | null;
  my_battlefield_card_id: string | null;
  opponent_battlefield_card_id: string | null;
  /** Cards set aside during mulligan (0–2). */
  my_mulligan_count: number | null;
  opponent_mulligan_count: number | null;
  /** Side-in/out notes (games 2–3 of a Bo3). */
  side_notes: string | null;
  /** Base by mode + battlefield "+1 to win" modifiers (stack); default 8. */
  target_score: number;
  status: MatchStatus;
  /** Final scores, written at game end (live scores are derived from events). */
  my_score: number;
  opponent_score: number;
  winner: GameWinner | null;
  started_at: string;
  ended_at: string | null;
}

export interface GameEvent {
  id: string;
  game_id: string;
  user_id: string;
  /**
   * Client insertion order, unique per game. The seq space is reserved to
   * the tracking device (client): it reflects the order events were recorded
   * locally, not global temporal order. Future server-side writers (e.g.
   * audio inference) must use a disjoint seq space and rely on `occurred_at`
   * for temporal interleaving.
   */
  seq: number;
  /** Nullable in SQL for future system/audio events; manual events always set it. */
  turn_number: number | null;
  actor: EventActor;
  event_type: GameEventType | (string & {});
  battlefield_card_id: string | null;
  /** Score delta. */
  points: number;
  payload: Record<string, unknown>;
  /** Client wall clock. */
  occurred_at: string;
  created_at: string;
}

/** Match with legends resolved client-side from the cached cards index. */
export interface MatchWithLegends extends Match {
  my_legend?: Card | null;
  opponent_legend?: Card | null;
}

/** Game merged with its ordered event log. */
export interface MatchGameWithEvents extends MatchGame {
  events: GameEvent[];
}

/** Aggregate stats (future collection_stats view / queries). */
export interface CollectionStats {
  unique_owned: number;
  complete_playsets: number;
  total_for_sale: number;
  set_completion: Array<{
    set_id: string;
    set_label: string;
    owned_count: number;
    total_count: number;
    completion_pct: number;
  }>;
}
