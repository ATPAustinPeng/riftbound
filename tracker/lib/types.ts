/** Database row types mirroring supabase/migrations/0001_init.sql */

export type CollectionGoal =
  | 'single_separate'
  | 'playset_separate'
  | 'playset_normal'
  | 'single_combined'
  | 'playset_combined';

export const DEFAULT_COLLECTION_GOAL: CollectionGoal = 'playset_separate';

export function isValidCollectionGoal(value: unknown): value is CollectionGoal {
  return (
    value === 'single_separate' ||
    value === 'playset_separate' ||
    value === 'playset_normal' ||
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

/** Match / game tracking (supabase/migrations/0005_games.sql). */

export type MatchFormat = '1v1';
export type MatchType = 'bo1' | 'bo3';
export type ScoreSource = 'battlefield' | 'effect';

export interface Match {
  id: string;
  owner_id: string;
  format: MatchFormat;
  match_type: MatchType;
  point_target: number;
  played_at: string;
  notes: string | null;
  share_token: string;
  created_at: string;
}

export interface MatchPlayer {
  id: string;
  match_id: string;
  seat: number;
  team_no: number | null;
  display_name: string;
  user_id: string | null;
  legend_card_id: string;
  domains: string[];
  deck_name: string | null;
  claim_token: string | null;
  claimed_at: string | null;
}

export interface Game {
  id: string;
  match_id: string;
  game_no: number;
  first_player_seat: number;
  winner_seat: number | null;
  point_target: number | null;
}

export interface GameBattlefield {
  game_id: string;
  position: number;
  card_id: string;
  contributed_by_seat: number | null;
}

export interface GameEvent {
  id: string;
  game_id: string;
  seq: number;
  turn_no: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ScoreEventPayload {
  scorer_seat: number;
  battlefield_position?: number;
  points: number;
  source: ScoreSource;
}

export interface MatchWithPlayers extends Match {
  players: MatchPlayer[];
  /** Present on list queries for series score display. */
  games?: Pick<Game, 'id' | 'game_no' | 'winner_seat' | 'match_id'>[];
}

export interface GameWithDetails extends Game {
  battlefields: GameBattlefield[];
  events: GameEvent[];
}

export interface MatchFull extends MatchWithPlayers {
  games: GameWithDetails[];
}

export interface DerivedScore {
  bySeat: Record<number, number>;
  byBattlefield: Record<number, Record<number, number>>;
  firstScorerSeat: number | null;
  totalEvents: number;
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
