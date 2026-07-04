import { FlashList } from '@shopify/flash-list';
import type { ReactElement, ReactNode } from 'react';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { CardTile } from '@/components/CardTile';
import { canBeFoil, evaluateGoal, SET_ORDER, type CollectionGoal } from '@/lib/queries';
import type { Card } from '@/lib/types';

const GRID_GAP = 8;
const HORIZONTAL_PADDING = 16;

type GridItem =
  | {
      type: 'header';
      setId: string;
      setLabel: string;
      owned: number;
      total: number;
      pct: number;
    }
  | { type: 'row'; cards: Array<Card & { _listKey?: string }>; rowIndex: number; setId: string };

interface CardGridProps {
  cards: Array<Card & { _listKey?: string }>;
  numColumns?: number;
  ownedByCardId?: Record<string, number>;
  foilOwnedByCardId?: Record<string, number>;
  forSaleByCardId?: Record<string, number>;
  wishlistedIds?: Set<string>;
  showSteppers?: boolean;
  quickAdd?: boolean;
  groupBySet?: boolean;
  dimMissing?: boolean;
  goal?: CollectionGoal;
  setsMeta?: Array<{ id: string; label: string }>;
  onOwnedChange?: (cardId: string, next: number) => void;
  onFoilOwnedChange?: (cardId: string, next: number) => void;
  onForSaleChange?: (cardId: string, next: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  emptyMessage?: string;
  ListHeaderComponent?: ReactElement | null;
}

function SetSectionHeader({
  setLabel,
  owned,
  total,
  pct,
}: {
  setLabel: string;
  owned: number;
  total: number;
  pct: number;
}) {
  return (
    <View className="gap-1 border-b border-neutral-100 bg-white pb-2 pt-4 dark:border-neutral-900 dark:bg-neutral-950">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          {setLabel}
        </Text>
        <Text className="text-xs font-medium text-neutral-500">
          {owned}/{total} ({pct}%)
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <View className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

function computeTileDimming(
  card: Card,
  owned: number,
  foil: number,
  dimMissing: boolean,
  goal?: CollectionGoal,
) {
  if (!dimMissing || !goal) {
    return { dimmed: false, foilMissing: false };
  }
  const cardCanFoil = canBeFoil(card);
  const evaluation = evaluateGoal(goal, owned, foil, cardCanFoil, card.card_type);
  const dimmed = owned + foil === 0;
  const foilMissing =
    !dimmed && cardCanFoil && evaluation.normalComplete && !evaluation.foilComplete;
  return { dimmed, foilMissing };
}

export function CardGrid({
  cards,
  numColumns = 3,
  ownedByCardId,
  foilOwnedByCardId,
  forSaleByCardId,
  wishlistedIds,
  showSteppers = false,
  quickAdd = false,
  groupBySet = false,
  dimMissing = false,
  goal,
  setsMeta,
  onOwnedChange,
  onFoilOwnedChange,
  onForSaleChange,
  isLoading = false,
  isError = false,
  onRetry,
  onRefresh,
  isRefreshing = false,
  emptyMessage = 'No cards match your filters.',
  ListHeaderComponent,
}: CardGridProps) {
  const { width } = useWindowDimensions();
  const tileWidth =
    (width - HORIZONTAL_PADDING * 2 - GRID_GAP * (numColumns - 1)) / numColumns;

  const setLabelById = useMemo(
    () => new Map(setsMeta?.map((s) => [s.id, s.label]) ?? []),
    [setsMeta],
  );

  const gridItems = useMemo((): GridItem[] => {
    if (!groupBySet) return [];

    const bySet = new Map<string, Array<Card & { _listKey?: string }>>();
    for (const card of cards) {
      const setId = card.set_id;
      const group = bySet.get(setId);
      if (group) {
        group.push(card);
      } else {
        bySet.set(setId, [card]);
      }
    }

    const setIds = [...bySet.keys()].sort(
      (a, b) => (SET_ORDER[a] ?? 999) - (SET_ORDER[b] ?? 999),
    );

    const items: GridItem[] = [];
    for (const setId of setIds) {
      const setCards = bySet.get(setId) ?? [];
      const owned = setCards.filter(
        (c) => (ownedByCardId?.[c.id] ?? 0) + (foilOwnedByCardId?.[c.id] ?? 0) > 0,
      ).length;
      const total = setCards.length;
      const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
      items.push({
        type: 'header',
        setId,
        setLabel: setLabelById.get(setId) ?? setId,
        owned,
        total,
        pct,
      });

      for (let i = 0; i < setCards.length; i += numColumns) {
        items.push({
          type: 'row',
          setId,
          rowIndex: i / numColumns,
          cards: setCards.slice(i, i + numColumns),
        });
      }
    }
    return items;
  }, [cards, groupBySet, numColumns, ownedByCardId, foilOwnedByCardId, setLabelById]);

  const renderTile = (item: Card & { _listKey?: string }) => {
    const owned = ownedByCardId?.[item.id] ?? 0;
    const foil = foilOwnedByCardId?.[item.id] ?? 0;
    const { dimmed, foilMissing } = computeTileDimming(item, owned, foil, dimMissing, goal);

    return (
      <CardTile
        card={item}
        owned={owned}
        foilOwned={foil}
        forSale={forSaleByCardId?.[item.id] ?? 0}
        wishlisted={wishlistedIds?.has(item.id)}
        showSteppers={showSteppers}
        quickAdd={quickAdd}
        onOwnedChange={onOwnedChange ? (next) => onOwnedChange(item.id, next) : undefined}
        onFoilChange={
          onFoilOwnedChange ? (next) => onFoilOwnedChange(item.id, next) : undefined
        }
        onForSaleChange={
          onForSaleChange ? (next) => onForSaleChange(item.id, next) : undefined
        }
        onQuickOwnedChange={quickAdd ? onOwnedChange : undefined}
        onQuickFoilChange={quickAdd ? onFoilOwnedChange : undefined}
        cardId={item.id}
        dimmed={dimmed}
        foilMissing={foilMissing}
      />
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-sm text-neutral-500">Loading cards…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-neutral-950">
        <Text className="mb-2 text-center text-base text-red-600 dark:text-red-400">
          Could not load cards.
        </Text>
        {onRetry ? (
          <Pressable onPress={onRetry}>
            <Text className="text-base font-semibold text-blue-600">Tap to retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (groupBySet) {
    const content: ReactNode[] = [];
    const stickyHeaderIndices: number[] = [];

    if (ListHeaderComponent) {
      content.push(<View key="__list-header">{ListHeaderComponent}</View>);
    }

    if (gridItems.length === 0) {
      content.push(
        <View key="__empty" className="items-center py-12">
          <Text className="text-center text-neutral-500">{emptyMessage}</Text>
        </View>,
      );
    }

    for (const item of gridItems) {
      if (item.type === 'header') {
        stickyHeaderIndices.push(content.length);
        content.push(
          <SetSectionHeader
            key={`header-${item.setId}`}
            setLabel={item.setLabel}
            owned={item.owned}
            total={item.total}
            pct={item.pct}
          />,
        );
      } else {
        content.push(
          <View
            key={`row-${item.setId}-${item.rowIndex}`}
            className="flex-row"
            style={{ marginBottom: GRID_GAP }}>
            {item.cards.map((card, index) => (
              <View
                key={card._listKey ?? card.id}
                style={{
                  width: tileWidth,
                  marginRight: index === item.cards.length - 1 ? 0 : GRID_GAP,
                }}>
                {renderTile(card)}
              </View>
            ))}
          </View>,
        );
      }
    }

    return (
      <View className="flex-1 bg-white dark:bg-neutral-950">
        <ScrollView
          stickyHeaderIndices={stickyHeaderIndices}
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} /> : undefined
          }>
          {content}
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-neutral-950">
      <FlashList
        data={cards}
        numColumns={numColumns}
        keyExtractor={(item: Card & { _listKey?: string }) => item._listKey ?? item.id}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
        ListHeaderComponent={ListHeaderComponent ?? undefined}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-center text-neutral-500">{emptyMessage}</Text>
          </View>
        }
        onRefresh={onRefresh}
        refreshing={onRefresh ? isRefreshing : undefined}
        renderItem={({ item, index }) => (
          <View
            style={{
              width: tileWidth,
              marginRight: index % numColumns === numColumns - 1 ? 0 : GRID_GAP,
              marginBottom: GRID_GAP,
            }}>
            {renderTile(item)}
          </View>
        )}
      />
    </View>
  );
}
