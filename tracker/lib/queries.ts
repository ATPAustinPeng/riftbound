import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type {
  Card,
  CardDomain,
  CardTag,
  CardWithMeta,
  CollectionGoal,
  CollectionStats,
  Set,
  UserCard,
  WishlistItem,
  WishlistItemWithCard,
} from '@/lib/types';
import { DEFAULT_COLLECTION_GOAL, isValidCollectionGoal } from '@/lib/types';

export type { CollectionGoal };
export { DEFAULT_COLLECTION_GOAL, isValidCollectionGoal };

export const COLLECTION_GOALS: Array<{
  id: CollectionGoal;
  shortLabel: string;
  description: string;
  statsSubtitle: string;
}> = [
  {
    id: 'single_separate',
    shortLabel: '1 each',
    description: '1 normal and 1 foil copy of each card (foil only for commons/uncommons).',
    statsSubtitle: '1+ each',
  },
  {
    id: 'playset_separate',
    shortLabel: '3 each',
    description:
      'Playset-sized normal and foil copies (3 default; Battlefield/Legend 1, Rune 12; Tokens untracked; foil only for commons/uncommons).',
    statsSubtitle: '3+ each',
  },
  {
    id: 'playset_normal',
    shortLabel: 'Playset (normal only)',
    description:
      'Playset-sized normal copies (3 default; Battlefield/Legend 1, Rune 12; Tokens untracked); foil not required.',
    statsSubtitle: '3+ normal',
  },
  {
    id: 'single_combined',
    shortLabel: '1 total',
    description: '1 copy of each card, counting normal and foil together.',
    statsSubtitle: '1+ combined',
  },
  {
    id: 'playset_combined',
    shortLabel: '3 total',
    description:
      'Playset-sized copies combined (3 default; Battlefield/Legend 1, Rune 12; Tokens untracked), counting normal and foil together.',
    statsSubtitle: '3+ combined',
  },
];

export function getPlaysetTarget(cardType: string | null | undefined): number | null {
  switch ((cardType ?? '').trim()) {
    case 'Token':
      return null;
    case 'Battlefield':
    case 'Legend':
      return 1;
    case 'Rune':
      return 12;
    default:
      return 3;
  }
}

export interface GoalEvaluation {
  target: number;
  combined: boolean;
  normalComplete: boolean;
  foilComplete: boolean;
  complete: boolean;
  untracked: boolean;
}

export function evaluateGoal(
  goal: CollectionGoal,
  owned: number,
  foil: number,
  canFoil: boolean,
  cardType?: string | null,
): GoalEvaluation {
  const playsetTarget = getPlaysetTarget(cardType);
  if (playsetTarget === null) {
    return {
      target: 0,
      combined: false,
      normalComplete: true,
      foilComplete: true,
      complete: true,
      untracked: true,
    };
  }

  if (goal === 'playset_normal') {
    const complete = owned >= playsetTarget;
    return {
      target: playsetTarget,
      combined: false,
      normalComplete: complete,
      foilComplete: true,
      complete,
      untracked: false,
    };
  }

  const target = goal.startsWith('single') ? 1 : playsetTarget;
  const combined = goal.endsWith('combined');

  if (combined) {
    const total = owned + foil;
    const complete = total >= target;
    return {
      target,
      combined: true,
      normalComplete: complete,
      foilComplete: complete,
      complete,
      untracked: false,
    };
  }

  const normalComplete = owned >= target;
  if (!canFoil) {
    return {
      target,
      combined: false,
      normalComplete,
      foilComplete: true,
      complete: normalComplete,
      untracked: false,
    };
  }

  const foilComplete = foil >= target;
  return {
    target,
    combined: false,
    normalComplete,
    foilComplete,
    complete: normalComplete && foilComplete,
    untracked: false,
  };
}

const CARDS_STALE_TIME = 1000 * 60 * 60 * 24; // 24h — reference data is static

export const queryKeys = {
  sets: ['sets'] as const,
  cards: ['cards'] as const,
  card: (id: string) => ['cards', id] as const,
  userCards: (userId: string) => ['userCards', userId] as const,
  wishlist: (userId: string) => ['wishlist', userId] as const,
  collectionStats: (userId: string, goal: CollectionGoal) =>
    ['collectionStats', userId, goal] as const,
};

export interface CardsIndex {
  cards: Card[];
  domainsByCardId: Record<string, CardDomain[]>;
  tagsByCardId: Record<string, CardTag[]>;
  sets: Set[];
  rarities: Array<{ id: string; label: string }>;
  domains: Array<{ id: string; label: string }>;
  cardTypes: string[];
}

export interface CardFilters {
  search: string;
  setId: string | null;
  rarityId: string | null;
  domainId: string | null;
  cardType: string | null;
  sortBy: 'set' | 'color' | 'name';
}

export const SET_ORDER: Record<string, number> = {
  OGS: 0,
  OGN: 1,
  SFD: 2,
  UNL: 3,
};

export const DOMAIN_COLOR_ORDER: Record<string, number> = {
  fury: 0,
  body: 1,
  order: 2,
  calm: 3,
  mind: 4,
  chaos: 5,
};

export const DOMAIN_COLORS: Record<string, { label: string; dot: string }> = {
  fury: { label: 'Fury', dot: 'bg-red-500' },
  body: { label: 'Body', dot: 'bg-orange-500' },
  order: { label: 'Order', dot: 'bg-yellow-400' },
  calm: { label: 'Calm', dot: 'bg-green-500' },
  mind: { label: 'Mind', dot: 'bg-blue-500' },
  chaos: { label: 'Chaos', dot: 'bg-purple-500' },
};

export type ViewMode = 'grid' | 'list';

const NO_DOMAIN_SORT_INDEX = 6;

export type FilteredCard = Card & { _listKey: string };

export const defaultCardFilters: CardFilters = {
  search: '',
  setId: null,
  rarityId: null,
  domainId: null,
  cardType: null,
  sortBy: 'set',
};

function throwOnError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('No data returned');
  return result.data;
}

// Supabase/PostgREST caps a single response at 1000 rows. Reference tables
// (card_domains, card_tags) and the cards table already approach or exceed
// that, so we must page through with .range() or rows get silently dropped.
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  table: string,
  orderColumns: string[],
  eq?: { column: string; value: string },
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    let query = supabase.from(table).select('*');
    if (eq) query = query.eq(eq.column, eq.value);
    for (const col of orderColumns) query = query.order(col);

    const page = throwOnError<T[]>(
      await query.range(from, from + SUPABASE_PAGE_SIZE - 1),
    );
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

async function fetchSets(): Promise<Set[]> {
  return fetchAllRows<Set>('sets', ['label']);
}

async function fetchCardsIndex(): Promise<CardsIndex> {
  const [sets, cards, domains, tags] = await Promise.all([
    fetchSets(),
    fetchAllRows<Card>('cards', ['id']),
    fetchAllRows<CardDomain>('card_domains', ['card_id', 'domain_id']),
    fetchAllRows<CardTag>('card_tags', ['card_id', 'tag']),
  ]);

  const domainsByCardId: Record<string, CardDomain[]> = {};
  for (const domain of domains) {
    if (!domainsByCardId[domain.card_id]) domainsByCardId[domain.card_id] = [];
    domainsByCardId[domain.card_id].push(domain);
  }

  const tagsByCardId: Record<string, CardTag[]> = {};
  for (const tag of tags) {
    if (!tagsByCardId[tag.card_id]) tagsByCardId[tag.card_id] = [];
    tagsByCardId[tag.card_id].push(tag);
  }

  const rarityMap = new Map<string, string>();
  const domainMap = new Map<string, string>();
  const cardTypeSet = new Set<string>();

  for (const card of cards) {
    if (card.rarity_id && card.rarity_label) {
      rarityMap.set(card.rarity_id, card.rarity_label);
    }
    if (card.card_type) cardTypeSet.add(card.card_type);
  }

  for (const domain of domains) {
    if (domain.domain_id) {
      domainMap.set(domain.domain_id, domain.domain_label ?? domain.domain_id);
    }
  }

  const rarities = [...rarityMap.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const domainOptions = [...domainMap.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const cardTypes = [...cardTypeSet].sort();

  return {
    cards,
    domainsByCardId,
    tagsByCardId,
    sets,
    rarities,
    domains: domainOptions,
    cardTypes,
  };
}

async function fetchUserCards(userId: string): Promise<Record<string, UserCard>> {
  const rows = await fetchAllRows<UserCard>('user_cards', ['card_id'], {
    column: 'user_id',
    value: userId,
  });
  return Object.fromEntries(rows.map((row) => [row.card_id, row]));
}

async function fetchWishlist(userId: string): Promise<Record<string, WishlistItem>> {
  const rows = await fetchAllRows<WishlistItem>('wishlist', ['card_id'], {
    column: 'user_id',
    value: userId,
  });
  return Object.fromEntries(rows.map((row) => [row.card_id, row]));
}

function countGoalCompleteCards(
  cards: Card[],
  userCards: Record<string, UserCard>,
  goal: CollectionGoal,
): number {
  let count = 0;
  for (const card of cards) {
    const entry = userCards[card.id];
    const owned = entry?.quantity_owned ?? 0;
    const foil = entry?.quantity_owned_foil ?? 0;
    const evaluation = evaluateGoal(goal, owned, foil, canBeFoil(card), card.card_type);
    if (!evaluation.untracked && evaluation.complete) {
      count++;
    }
  }
  return count;
}

async function fetchCollectionStats(userId: string, goal: CollectionGoal): Promise<CollectionStats> {
  const [summaryResult, completionResult, index, userCards] = await Promise.all([
    supabase.rpc('get_my_collection_summary'),
    supabase.rpc('get_my_set_completion'),
    fetchCardsIndex(),
    fetchUserCards(userId),
  ]);

  const complete_playsets = countGoalCompleteCards(index.cards, userCards, goal);

  if (summaryResult.error) {
    return computeCollectionStatsClientSide(userId, goal, index, userCards, complete_playsets);
  }

  const summary = summaryResult.data?.[0] ?? {
    unique_owned: 0,
    complete_playsets: 0,
    total_for_sale: 0,
  };

  const setCompletion = (completionResult.data ?? []).map(
    (row: {
      set_id: string;
      set_label: string;
      owned_count: number;
      total_count: number;
    }) => ({
      set_id: row.set_id,
      set_label: row.set_label,
      owned_count: Number(row.owned_count),
      total_count: Number(row.total_count),
      completion_pct:
        row.total_count > 0
          ? Math.round((Number(row.owned_count) / Number(row.total_count)) * 100)
          : 0,
    }),
  );

  return {
    unique_owned: Number(summary.unique_owned),
    complete_playsets,
    total_for_sale: Number(summary.total_for_sale),
    set_completion: setCompletion,
  };
}

async function computeCollectionStatsClientSide(
  userId: string,
  goal: CollectionGoal,
  index?: CardsIndex,
  userCards?: Record<string, UserCard>,
  completePlaysets?: number,
): Promise<CollectionStats> {
  const [resolvedIndex, resolvedUserCards] = await Promise.all([
    index ?? fetchCardsIndex(),
    userCards ?? fetchUserCards(userId),
  ]);

  const ownedEntries = Object.values(resolvedUserCards).filter(
    (uc) => uc.quantity_owned + (uc.quantity_owned_foil ?? 0) > 0,
  );
  const cardsBySet = new Map<string, number>();

  for (const card of resolvedIndex.cards) {
    cardsBySet.set(card.set_id, (cardsBySet.get(card.set_id) ?? 0) + 1);
  }

  const ownedBySet = new Map<string, number>();
  for (const uc of ownedEntries) {
    const card = resolvedIndex.cards.find((c) => c.id === uc.card_id);
    if (!card) continue;
    ownedBySet.set(card.set_id, (ownedBySet.get(card.set_id) ?? 0) + 1);
  }

  const set_completion = resolvedIndex.sets.map((set) => {
    const owned_count = ownedBySet.get(set.id) ?? 0;
    const total_count = cardsBySet.get(set.id) ?? 0;
    return {
      set_id: set.id,
      set_label: set.label,
      owned_count,
      total_count,
      completion_pct: total_count > 0 ? Math.round((owned_count / total_count) * 100) : 0,
    };
  });

  return {
    unique_owned: ownedEntries.length,
    complete_playsets:
      completePlaysets ??
      countGoalCompleteCards(resolvedIndex.cards, resolvedUserCards, goal),
    total_for_sale: ownedEntries.reduce((sum, uc) => sum + uc.for_sale_count, 0),
    set_completion,
  };
}

export function useSets(): UseQueryResult<Set[]> {
  return useQuery({
    queryKey: queryKeys.sets,
    queryFn: fetchSets,
    staleTime: CARDS_STALE_TIME,
  });
}

export function useCardsIndex(): UseQueryResult<CardsIndex> {
  return useQuery({
    queryKey: queryKeys.cards,
    queryFn: fetchCardsIndex,
    staleTime: CARDS_STALE_TIME,
  });
}

export function useCard(cardId: string | undefined): UseQueryResult<CardWithMeta | null> {
  const indexQuery = useCardsIndex();

  return useQuery({
    queryKey: queryKeys.card(cardId ?? ''),
    queryFn: () => {
      if (!cardId || !indexQuery.data) return null;
      const card = indexQuery.data.cards.find((c) => c.id === cardId);
      if (!card) return null;
      return {
        ...card,
        domains: indexQuery.data.domainsByCardId[cardId] ?? [],
        tags: indexQuery.data.tagsByCardId[cardId] ?? [],
      };
    },
    enabled: !!cardId && !!indexQuery.data,
    staleTime: CARDS_STALE_TIME,
  });
}

export function useUserCardsMap(): UseQueryResult<Record<string, UserCard>> {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.userCards(user?.id ?? ''),
    queryFn: () => fetchUserCards(user!.id),
    enabled: !!user?.id,
  });
}

export function useWishlistMap(): UseQueryResult<Record<string, WishlistItem>> {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.wishlist(user?.id ?? ''),
    queryFn: () => fetchWishlist(user!.id),
    enabled: !!user?.id,
  });
}

export function useCollectionGoal(): {
  goal: CollectionGoal;
  setGoal: (goal: CollectionGoal) => Promise<void>;
} {
  const { profile, setCollectionGoal } = useAuth();
  const goal = profile?.collection_goal ?? DEFAULT_COLLECTION_GOAL;

  return {
    goal,
    setGoal: setCollectionGoal,
  };
}

export function useCollectionStats(): UseQueryResult<CollectionStats> {
  const { user } = useAuth();
  const { goal } = useCollectionGoal();

  return useQuery({
    queryKey: queryKeys.collectionStats(user?.id ?? '', goal),
    queryFn: () => fetchCollectionStats(user!.id, goal),
    enabled: !!user?.id,
  });
}

function collectorParts(card: Pick<Card, 'public_code' | 'collector_number'>): {
  num: number;
  suffix: string;
} {
  const m = card.public_code?.match(/-(\d+)([a-zA-Z]*)\//);
  if (m) return { num: parseInt(m[1], 10), suffix: m[2].toLowerCase() };
  const num = Number(card.collector_number);
  return { num: Number.isNaN(num) ? Number.POSITIVE_INFINITY : num, suffix: '' };
}

function compareCards(a: Card, b: Card): number {
  const pa = collectorParts(a);
  const pb = collectorParts(b);
  if (pa.num !== pb.num) return pa.num - pb.num;
  return pa.suffix.localeCompare(pb.suffix);
}

function compareSetIds(a: string, b: string): number {
  const orderA = SET_ORDER[a];
  const orderB = SET_ORDER[b];
  if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
  if (orderA !== undefined) return -1;
  if (orderB !== undefined) return 1;
  return a.localeCompare(b);
}

function colorSortKey(card: Card, index: CardsIndex): { bucket: number; primary: number } {
  const ids = Array.from(
    new Set((index.domainsByCardId[card.id] ?? []).map((d) => d.domain_id)),
  );
  if (ids.length === 0) {
    return { bucket: Number.POSITIVE_INFINITY, primary: NO_DOMAIN_SORT_INDEX };
  }
  const primary = Math.min(...ids.map((id) => DOMAIN_COLOR_ORDER[id] ?? NO_DOMAIN_SORT_INDEX));
  return { bucket: ids.length, primary };
}

export function filterCards(
  cards: Card[],
  filters: CardFilters,
  index: CardsIndex,
): FilteredCard[] {
  const search = filters.search.trim().toLowerCase();

  const filtered = cards.filter((card) => {
    if (search && !card.name.toLowerCase().includes(search)) return false;
    if (filters.setId && card.set_id !== filters.setId) return false;
    if (filters.rarityId && card.rarity_id !== filters.rarityId) return false;
    if (filters.cardType && card.card_type !== filters.cardType) return false;
    if (filters.domainId) {
      const domains = index.domainsByCardId[card.id] ?? [];
      if (!domains.some((d) => d.domain_id === filters.domainId)) return false;
    }
    return true;
  });

  if (filters.sortBy === 'color') {
    const sorted = [...filtered].sort((a, b) => {
      const ka = colorSortKey(a, index);
      const kb = colorSortKey(b, index);
      if (ka.primary !== kb.primary) return ka.primary - kb.primary;
      if (ka.bucket !== kb.bucket) return ka.bucket - kb.bucket;
      const setCompare = compareSetIds(a.set_id, b.set_id);
      if (setCompare !== 0) return setCompare;
      return compareCards(a, b);
    });
    return sorted.map((card) => ({ ...card, _listKey: card.id }));
  }

  const sorted = [...filtered].sort((a, b) => {
    if (filters.sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    const setCompare = compareSetIds(a.set_id, b.set_id);
    if (setCompare !== 0) return setCompare;
    return compareCards(a, b);
  });

  return sorted.map((card) => ({ ...card, _listKey: `${card.id}_0` }));
}

export function getUserCardEntry(
  map: Record<string, UserCard> | undefined,
  cardId: string,
): UserCard | undefined {
  return map?.[cardId];
}

export function getOwnedQuantity(map: Record<string, UserCard> | undefined, cardId: string): number {
  return map?.[cardId]?.quantity_owned ?? 0;
}

export function getOwnedFoilQuantity(
  map: Record<string, UserCard> | undefined,
  cardId: string,
): number {
  return map?.[cardId]?.quantity_owned_foil ?? 0;
}

export function canBeFoil(card: Pick<Card, 'rarity_id'>): boolean {
  return card.rarity_id === 'common' || card.rarity_id === 'uncommon';
}

export function getForSaleCount(map: Record<string, UserCard> | undefined, cardId: string): number {
  return map?.[cardId]?.for_sale_count ?? 0;
}

export function isWishlisted(map: Record<string, WishlistItem> | undefined, cardId: string): boolean {
  return !!map?.[cardId];
}

interface UpsertUserCardInput {
  cardId: string;
  quantity_owned?: number;
  quantity_owned_foil?: number;
  for_sale_count?: number;
  notes?: string | null;
}

export function useUpsertUserCardMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  return useMutation({
    mutationFn: async (input: UpsertUserCardInput) => {
      if (!userId) throw new Error('Not signed in');

      const existing = queryClient.getQueryData<Record<string, UserCard>>(
        queryKeys.userCards(userId),
      )?.[input.cardId];

      const payload = {
        user_id: userId,
        card_id: input.cardId,
        quantity_owned: input.quantity_owned ?? existing?.quantity_owned ?? 0,
        quantity_owned_foil: input.quantity_owned_foil ?? existing?.quantity_owned_foil ?? 0,
        for_sale_count: input.for_sale_count ?? existing?.for_sale_count ?? 0,
        notes: input.notes !== undefined ? input.notes : (existing?.notes ?? null),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('user_cards')
        .upsert(payload, { onConflict: 'user_id,card_id' })
        .select()
        .single();

      if (error) throw error;
      return data as UserCard;
    },
    onMutate: async (input) => {
      if (!userId) return;

      // Snapshot before optimistic write
      const previous = queryClient.getQueryData<Record<string, UserCard>>(
        queryKeys.userCards(userId),
      );

      // Apply optimistic update FIRST so the UI responds on the same tick
      queryClient.setQueryData<Record<string, UserCard>>(queryKeys.userCards(userId), (old) => {
        const current = old?.[input.cardId];
        const next: UserCard = {
          user_id: userId,
          card_id: input.cardId,
          quantity_owned: input.quantity_owned ?? current?.quantity_owned ?? 0,
          quantity_owned_foil: input.quantity_owned_foil ?? current?.quantity_owned_foil ?? 0,
          for_sale_count: input.for_sale_count ?? current?.for_sale_count ?? 0,
          notes: input.notes !== undefined ? input.notes : (current?.notes ?? null),
          updated_at: new Date().toISOString(),
        };
        return { ...old, [input.cardId]: next };
      });

      // Cancel any in-flight refetches after the write so they don't clobber it
      await queryClient.cancelQueries({ queryKey: queryKeys.userCards(userId) });

      return { previous };
    },
    onSuccess: (data) => {
      // Write the server-confirmed row directly into the cache — no refetch needed
      queryClient.setQueryData<Record<string, UserCard>>(queryKeys.userCards(userId), (old) => ({
        ...old,
        [data.card_id]: data,
      }));
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.userCards(userId), context.previous);
      }
    },
    onSettled: () => {
      // Only invalidate stats (not userCards) — avoids a grid-churn refetch on every click
      queryClient.invalidateQueries({ queryKey: ['collectionStats', userId] });
    },
  });
}

export function useToggleWishlistMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? '';

  return useMutation({
    mutationFn: async ({ cardId, add }: { cardId: string; add: boolean }) => {
      if (!userId) throw new Error('Not signed in');

      if (add) {
        const { data, error } = await supabase
          .from('wishlist')
          .upsert({ user_id: userId, card_id: cardId }, { onConflict: 'user_id,card_id' })
          .select()
          .single();
        if (error) throw error;
        return data as WishlistItem;
      }

      const { error } = await supabase
        .from('wishlist')
        .delete()
        .eq('user_id', userId)
        .eq('card_id', cardId);
      if (error) throw error;
      return null;
    },
    onMutate: async ({ cardId, add }) => {
      if (!userId) return;

      await queryClient.cancelQueries({ queryKey: queryKeys.wishlist(userId) });
      const previous = queryClient.getQueryData<Record<string, WishlistItem>>(
        queryKeys.wishlist(userId),
      );

      queryClient.setQueryData<Record<string, WishlistItem>>(queryKeys.wishlist(userId), (old) => {
        const next = { ...old };
        if (add) {
          next[cardId] = {
            user_id: userId,
            card_id: cardId,
            created_at: new Date().toISOString(),
          };
        } else {
          delete next[cardId];
        }
        return next;
      });

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.wishlist(userId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wishlist(userId) });
    },
  });
}

export function useMarkOwnedFromWishlistMutation() {
  const upsert = useUpsertUserCardMutation();
  const toggleWishlist = useToggleWishlistMutation();

  return useMutation({
    mutationFn: async ({ cardId, quantity = 1 }: { cardId: string; quantity?: number }) => {
      await upsert.mutateAsync({ cardId, quantity_owned: quantity });
      await toggleWishlist.mutateAsync({ cardId, add: false });
    },
  });
}

export function buildWishlistWithCards(
  wishlistMap: Record<string, WishlistItem>,
  cards: Card[],
): WishlistItemWithCard[] {
  const cardById = new Map(cards.map((c) => [c.id, c]));

  return Object.values(wishlistMap)
    .map((item) => {
      const card = cardById.get(item.card_id);
      if (!card) return null;
      return { ...item, card };
    })
    .filter((item): item is WishlistItemWithCard => item !== null)
    .sort((a, b) => a.card.name.localeCompare(b.card.name));
}

export const PLAYSET_SIZE = 3;

export function playsetProgress(quantityOwned: number): { owned: number; target: number; complete: boolean } {
  return {
    owned: Math.min(quantityOwned, PLAYSET_SIZE),
    target: PLAYSET_SIZE,
    complete: quantityOwned >= PLAYSET_SIZE,
  };
}
