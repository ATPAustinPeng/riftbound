import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { CardGrid } from '@/components/CardGrid';
import { CardListView } from '@/components/CardListView';
import { CollectionGoalSelector } from '@/components/CollectionGoalSelector';
import { ExportMissingModal } from '@/components/ExportMissingModal';
import { FilterBar } from '@/components/FilterBar';
import { useBrowserState } from '@/lib/browser-store';
import {
  buildMissingRows,
  missingCsvFilename,
  rowsToCsv,
} from '@/lib/export-missing';
import {
  canBeFoil,
  evaluateGoal,
  filterCards,
  useCollectionGoal,
  type CardsIndex,
} from '@/lib/queries';
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
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showGoalSelector?: boolean;
  showCollectionControls?: boolean;
}

const COLLECTION_VIEW_OPTIONS: Array<{ id: 'owned' | 'missing' | 'all'; label: string }> = [
  { id: 'owned', label: 'Owned' },
  { id: 'missing', label: 'Missing' },
  { id: 'all', label: 'All' },
];

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
  onRefresh,
  isRefreshing,
  showGoalSelector = false,
  showCollectionControls = false,
}: CardBrowserProps) {
  const {
    filters,
    setFilters,
    numColumns,
    setNumColumns,
    viewMode,
    setViewMode,
    collectionView,
    setCollectionView,
    groupBySet,
    setGroupBySet,
    hideComplete,
    setHideComplete,
  } = useBrowserState();
  const { goal } = useCollectionGoal();
  const [exportModalVisible, setExportModalVisible] = useState(false);

  const filteredBySearch = useMemo(
    () => filterCards(cards, filters, index),
    [cards, filters, index],
  );

  const filteredCards = useMemo(() => {
    if (!showCollectionControls) return filteredBySearch;

    return filteredBySearch.filter((card) => {
      const owned = ownedByCardId[card.id] ?? 0;
      const foil = foilOwnedByCardId[card.id] ?? 0;
      const evaluation = evaluateGoal(goal, owned, foil, canBeFoil(card), card.card_type);

      if (collectionView === 'owned') {
        return owned + foil > 0;
      }
      if (collectionView === 'missing') {
        return !evaluation.complete;
      }
      if (hideComplete && evaluation.complete) {
        return false;
      }
      return true;
    });
  }, [
    filteredBySearch,
    showCollectionControls,
    collectionView,
    hideComplete,
    goal,
    ownedByCardId,
    foilOwnedByCardId,
  ]);

  const missingExport = useMemo(() => {
    const rows = buildMissingRows(
      filteredBySearch,
      index,
      ownedByCardId,
      foilOwnedByCardId,
      goal,
    );
    return { rows, csv: rowsToCsv(rows), count: rows.length };
  }, [filteredBySearch, index, ownedByCardId, foilOwnedByCardId, goal]);

  const effectiveListQuantityMode = showCollectionControls
    ? collectionView === 'missing'
      ? 'needed'
      : 'owned'
    : listQuantityMode;

  const dimMissing = showCollectionControls && collectionView === 'all';
  const effectiveGroupBySet =
    showCollectionControls && (collectionView === 'all' || groupBySet);

  const collectionControls = showCollectionControls ? (
    <View className="gap-2 px-4 pb-2">
      <View className="flex-row rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900">
        {COLLECTION_VIEW_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => setCollectionView(option.id)}
            className={`flex-1 items-center py-2 active:opacity-70 ${
              collectionView === option.id ? 'bg-white dark:bg-neutral-800' : ''
            }`}>
            <Text
              className={`text-sm font-medium ${
                collectionView === option.id
                  ? 'text-neutral-900 dark:text-white'
                  : 'text-neutral-500 dark:text-neutral-400'
              }`}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {collectionView === 'all' ? (
          <View className="flex-row items-center gap-2">
            <Switch
              value={hideComplete}
              onValueChange={setHideComplete}
              trackColor={{ false: '#d4d4d4', true: '#2563eb' }}
            />
            <Text className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Hide complete
            </Text>
          </View>
        ) : null}
        {collectionView !== 'all' ? (
          <Pressable
            onPress={() => setGroupBySet(!groupBySet)}
            className={`rounded-full border px-3 py-1.5 ${
              groupBySet
                ? 'border-blue-600 bg-blue-600 active:bg-blue-700'
                : 'border-neutral-300 bg-white active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:active:bg-neutral-800'
            }`}>
            <Text
              className={`text-xs font-medium ${
                groupBySet ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
              }`}>
              Group by set
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setExportModalVisible(true)}
          disabled={missingExport.count === 0}
          className={`rounded-full border px-3 py-1.5 ${
            missingExport.count === 0
              ? 'border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900'
              : 'border-neutral-300 bg-white active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:active:bg-neutral-800'
          }`}>
          <Text
            className={`text-xs font-medium ${
              missingExport.count === 0
                ? 'text-neutral-400 dark:text-neutral-600'
                : 'text-neutral-700 dark:text-neutral-300'
            }`}>
            Export missing
          </Text>
        </Pressable>
      </View>
      <ExportMissingModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        csv={missingExport.csv}
        count={missingExport.count}
        filename={missingCsvFilename(goal)}
      />
    </View>
  ) : null;

  const header = (
    <View className="pb-2 pt-1">
      {headerExtra}
      {collectionControls}
      {showGoalSelector ? <CollectionGoalSelector compact /> : null}
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
        quantityMode={effectiveListQuantityMode}
        goal={goal}
        quickAdd={quickAdd}
        dimMissing={dimMissing}
        onOwnedChange={onOwnedChange}
        onFoilOwnedChange={onFoilOwnedChange}
        isLoading={isLoading}
        isError={isError}
        onRetry={onRetry}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
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
      groupBySet={effectiveGroupBySet}
      dimMissing={dimMissing}
      goal={goal}
      setsMeta={index.sets}
      onOwnedChange={onOwnedChange}
      onFoilOwnedChange={onFoilOwnedChange}
      onForSaleChange={onForSaleChange}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      ListHeaderComponent={header}
      emptyMessage={emptyMessage}
    />
  );
}
