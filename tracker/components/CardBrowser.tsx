import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { CardGrid } from '@/components/CardGrid';
import { CardListView } from '@/components/CardListView';
import { defaultCardFilters, FilterBar } from '@/components/FilterBar';
import { filterCards, type CardsIndex, type ViewMode } from '@/lib/queries';
import type { Card } from '@/lib/types';

interface CardBrowserProps {
  cards: Card[];
  index: CardsIndex;
  ownedByCardId: Record<string, number>;
  foilOwnedByCardId: Record<string, number>;
  forSaleByCardId: Record<string, number>;
  wishlistedIds?: Set<string>;
  quickAdd?: boolean;
  listQuantityMode: 'owned' | 'needed';
  onOwnedChange: (cardId: string, next: number) => void;
  onFoilOwnedChange: (cardId: string, next: number) => void;
  onForSaleChange?: (cardId: string, next: number) => void;
  headerExtra?: ReactElement;
  emptyMessage: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function CardBrowser({
  cards,
  index,
  ownedByCardId,
  foilOwnedByCardId,
  forSaleByCardId,
  wishlistedIds,
  quickAdd,
  listQuantityMode,
  onOwnedChange,
  onFoilOwnedChange,
  onForSaleChange,
  headerExtra,
  emptyMessage,
  isLoading,
  isError,
  onRetry,
}: CardBrowserProps) {
  const [filters, setFilters] = useState(defaultCardFilters);
  const [numColumns, setNumColumns] = useState(3);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const filteredCards = useMemo(
    () => filterCards(cards, filters, index),
    [cards, filters, index],
  );

  const header = (
    <View className="pb-2 pt-1">
      {headerExtra}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        index={index}
        numColumns={numColumns}
        onColumnsChange={setNumColumns}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      <Text className="px-4 pt-2 text-xs text-neutral-500">
        {filteredCards.length} card{filteredCards.length === 1 ? '' : 's'}
      </Text>
    </View>
  );

  if (viewMode === 'list') {
    return (
      <CardListView
        cards={filteredCards}
        index={index}
        ownedByCardId={ownedByCardId}
        foilOwnedByCardId={foilOwnedByCardId}
        quantityMode={listQuantityMode}
        quickAdd={quickAdd}
        onOwnedChange={onOwnedChange}
        onFoilOwnedChange={onFoilOwnedChange}
        isLoading={isLoading}
        isError={isError}
        onRetry={onRetry}
        emptyMessage={emptyMessage}
        ListHeaderComponent={header}
      />
    );
  }

  return (
    <CardGrid
      cards={filteredCards}
      numColumns={numColumns}
      ownedByCardId={ownedByCardId}
      foilOwnedByCardId={foilOwnedByCardId}
      forSaleByCardId={forSaleByCardId}
      wishlistedIds={wishlistedIds}
      quickAdd={quickAdd}
      onOwnedChange={onOwnedChange}
      onFoilOwnedChange={onFoilOwnedChange}
      onForSaleChange={onForSaleChange}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      ListHeaderComponent={header}
      emptyMessage={emptyMessage}
    />
  );
}
