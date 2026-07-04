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
