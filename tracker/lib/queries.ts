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
  CollectionStats,
  Set,
  UserCard,
  WishlistItem,
  WishlistItemWithCard,
} from '@/lib/types';

const CARDS_STALE_TIME = 1000 * 60 * 60 * 24; // 24h — reference data is static

export const queryKeys = {
  sets: ['sets'] as const,
  cards: ['cards'] as const,
  card: (id: string) => ['cards', id] as const,
  userCards: (userId: string) => ['userCards', userId] as const,
  wishlist: (userId: string) => ['wishlist', userId] as const,
  collectionStats: (userId: string) => ['collectionStats', userId] as const,
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
  sortBy: 'name' | 'collector_number' | 'domain';
}

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
  sortBy: 'collector_number',
};

function throwOnError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('No data returned');
  return result.data;
}

async function fetchSets(): Promise<Set[]> {
  const result = await supabase.from('sets').select('*').order('label');
  return throwOnError(result);
}

async function fetchCardsIndex(): Promise<CardsIndex> {
  const [sets, cardsResult, domainsResult, tagsResult] = await Promise.all([
    fetchSets(),
    supabase.from('cards').select('*').order('name'),
    supabase.from('card_domains').select('*'),
    supabase.from('card_tags').select('*'),
  ]);

  const cards = throwOnError(cardsResult);
  const domains = throwOnError(domainsResult);
  const tags = throwOnError(tagsResult);

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
  const result = await supabase.from('user_cards').select('*').eq('user_id', userId);
  const rows = throwOnError(result);
  return Object.fromEntries(rows.map((row) => [row.card_id, row]));
}

async function fetchWishlist(userId: string): Promise<Record<string, WishlistItem>> {
  const result = await supabase.from('wishlist').select('*').eq('user_id', userId);
  const rows = throwOnError(result);
  return Object.fromEntries(rows.map((row) => [row.card_id, row]));
}

async function fetchCollectionStats(userId: string): Promise<CollectionStats> {
  const [summaryResult, completionResult] = await Promise.all([
    supabase.rpc('get_my_collection_summary'),
    supabase.rpc('get_my_set_completion'),
  ]);

  if (summaryResult.error) {
    return computeCollectionStatsClientSide(userId);
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
    complete_playsets: Number(summary.complete_playsets),
    total_for_sale: Number(summary.total_for_sale),
    set_completion: setCompletion,
  };
}

async function computeCollectionStatsClientSide(userId: string): Promise<CollectionStats> {
  const [index, userCards] = await Promise.all([
    fetchCardsIndex(),
    fetchUserCards(userId),
  ]);

  const ownedEntries = Object.values(userCards).filter(
    (uc) => uc.quantity_owned + (uc.quantity_owned_foil ?? 0) > 0,
  );
  const cardsBySet = new Map<string, number>();

  for (const card of index.cards) {
    cardsBySet.set(card.set_id, (cardsBySet.get(card.set_id) ?? 0) + 1);
  }

  const ownedBySet = new Map<string, number>();
  for (const uc of ownedEntries) {
    const card = index.cards.find((c) => c.id === uc.card_id);
    if (!card) continue;
    ownedBySet.set(card.set_id, (ownedBySet.get(card.set_id) ?? 0) + 1);
  }

  const set_completion = index.sets.map((set) => {
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
    complete_playsets: ownedEntries.filter(
      (uc) => uc.quantity_owned + (uc.quantity_owned_foil ?? 0) >= 3,
    ).length,
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

export function useCollectionStats(): UseQueryResult<CollectionStats> {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.collectionStats(user?.id ?? ''),
    queryFn: () => fetchCollectionStats(user!.id),
    enabled: !!user?.id,
  });
}

function compareCollectorNumbers(a: string | null, b: string | null): number {
  const numA = a != null ? parseInt(a, 10) : NaN;
  const numB = b != null ? parseInt(b, 10) : NaN;
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
  if (!Number.isNaN(numA)) return -1;
  if (!Number.isNaN(numB)) return 1;
  return (a ?? '').localeCompare(b ?? '');
}

function domainSortIndex(card: Card, listKey: string, index: CardsIndex): number {
  let domainId: string | null = null;
  if (listKey.endsWith('_0')) {
    const domains = index.domainsByCardId[card.id] ?? [];
    domainId = domains.length === 1 ? domains[0].domain_id : null;
  } else {
    domainId = listKey.slice(card.id.length + 1);
  }
  if (!domainId) return NO_DOMAIN_SORT_INDEX;
  return DOMAIN_COLOR_ORDER[domainId] ?? NO_DOMAIN_SORT_INDEX;
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

  if (filters.sortBy === 'domain') {
    const expanded: FilteredCard[] = [];

    for (const card of filtered) {
      const domains = index.domainsByCardId[card.id] ?? [];

      if (domains.length > 1) {
        for (const domain of domains) {
          expanded.push({ ...card, _listKey: `${card.id}_${domain.domain_id}` });
        }
      } else {
        expanded.push({ ...card, _listKey: `${card.id}_0` });
      }
    }

    return expanded.sort((a, b) => {
      const domainCompare =
        domainSortIndex(a, a._listKey, index) - domainSortIndex(b, b._listKey, index);
      if (domainCompare !== 0) return domainCompare;
      return compareCollectorNumbers(a.collector_number, b.collector_number);
    });
  }

  const sorted = [...filtered].sort((a, b) => {
    if (filters.sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }
    const setCompare = a.set_id.localeCompare(b.set_id);
    if (setCompare !== 0) return setCompare;
    return compareCollectorNumbers(a.collector_number, b.collector_number);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.collectionStats(userId) });
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
