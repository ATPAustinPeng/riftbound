import { FlashList } from '@shopify/flash-list';
import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { CardTile } from '@/components/CardTile';
import type { Card } from '@/lib/types';

const GRID_GAP = 8;
const HORIZONTAL_PADDING = 16;

interface CardGridProps {
  cards: Array<Card & { _listKey?: string }>;
  numColumns?: number;
  ownedByCardId?: Record<string, number>;
  foilOwnedByCardId?: Record<string, number>;
  forSaleByCardId?: Record<string, number>;
  wishlistedIds?: Set<string>;
  showSteppers?: boolean;
  quickAdd?: boolean;
  /** Id-aware handler — stable reference avoids per-item closure churn in quickAdd mode */
  onOwnedChange?: (cardId: string, next: number) => void;
  onFoilOwnedChange?: (cardId: string, next: number) => void;
  onForSaleChange?: (cardId: string, next: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  ListHeaderComponent?: ReactElement | null;
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
  onOwnedChange,
  onFoilOwnedChange,
  onForSaleChange,
  isLoading = false,
  isError = false,
  onRetry,
  emptyMessage = 'No cards match your filters.',
  ListHeaderComponent,
}: CardGridProps) {
  const { width } = useWindowDimensions();
  const tileWidth =
    (width - HORIZONTAL_PADDING * 2 - GRID_GAP * (numColumns - 1)) / numColumns;

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
        renderItem={({ item, index }) => (
          <View
            style={{
              width: tileWidth,
              marginRight: index % numColumns === numColumns - 1 ? 0 : GRID_GAP,
              marginBottom: GRID_GAP,
            }}>
            <CardTile
              card={item}
              owned={ownedByCardId?.[item.id] ?? 0}
              foilOwned={foilOwnedByCardId?.[item.id] ?? 0}
              forSale={forSaleByCardId?.[item.id] ?? 0}
              wishlisted={wishlistedIds?.has(item.id)}
              showSteppers={showSteppers}
              quickAdd={quickAdd}
              onOwnedChange={
                onOwnedChange ? (next) => onOwnedChange(item.id, next) : undefined
              }
              onFoilChange={
                onFoilOwnedChange ? (next) => onFoilOwnedChange(item.id, next) : undefined
              }
              onForSaleChange={
                onForSaleChange ? (next) => onForSaleChange(item.id, next) : undefined
              }
              onQuickOwnedChange={quickAdd ? onOwnedChange : undefined}
              onQuickFoilChange={quickAdd ? onFoilOwnedChange : undefined}
              cardId={item.id}
            />
          </View>
        )}
      />
    </View>
  );
}
