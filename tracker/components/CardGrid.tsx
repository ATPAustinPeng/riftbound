import { FlashList } from '@shopify/flash-list';
import type { ReactElement, ReactNode } from 'react';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { CardTile } from '@/components/CardTile';
import {
  DomainBandHeader,
  SetHeader,
  WEB_STICKY_BAND_BELOW_SET,
  WEB_STICKY_BAND_TOP,
  WEB_STICKY_SET,
} from '@/components/section-headers';
import { buildSetSections } from '@/lib/card-sections';
import {
  evaluateGoal,
  type CardsIndex,
  type CollectionGoal,
  type FilteredCard,
} from '@/lib/queries';
import type { Card } from '@/lib/types';

const GRID_GAP = 8;
const HORIZONTAL_PADDING = 16;

type GridFlatItem =
  | { type: 'set'; key: string; label: string; count: number; owned?: number }
  | {
      type: 'band';
      key: string;
      label: string;
      dot?: string;
      count: number;
      setLabel?: string;
    }
  | { type: 'row'; key: string; cards: FilteredCard[] };

interface CardGridProps {
  cards: FilteredCard[];
  index: CardsIndex;
  numColumns?: number;
  ownedByCardId?: Record<string, number>;
  foilOwnedByCardId?: Record<string, number>;
  forSaleByCardId?: Record<string, number>;
  wishlistedIds?: Set<string>;
  showSteppers?: boolean;
  quickAdd?: boolean;
  dimMissing?: boolean;
  goal?: CollectionGoal;
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

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
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
  const evaluation = evaluateGoal(goal, owned, foil, card);
  const dimmed = owned + foil === 0;
  const foilMissing =
    !dimmed && evaluation.foilTarget > 0 && evaluation.normalComplete && !evaluation.foilComplete;
  return { dimmed, foilMissing };
}

export function CardGrid({
  cards,
  index,
  numColumns = 3,
  ownedByCardId,
  foilOwnedByCardId,
  forSaleByCardId,
  wishlistedIds,
  showSteppers = false,
  quickAdd = false,
  dimMissing = false,
  goal,
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

  const sections = useMemo(() => buildSetSections(cards, index), [cards, index]);
  const showSetHeaders = sections.length > 1;
  const ownedBySet = useMemo(() => {
    if (!ownedByCardId && !foilOwnedByCardId) return undefined;
    const map: Record<string, number> = {};
    for (const section of sections) {
      let owned = 0;
      for (const band of section.bands) {
        for (const card of band.cards) {
          if ((ownedByCardId?.[card.id] ?? 0) + (foilOwnedByCardId?.[card.id] ?? 0) > 0) owned++;
        }
      }
      map[section.setId] = owned;
    }
    return map;
  }, [sections, ownedByCardId, foilOwnedByCardId]);

  const flat = useMemo(() => {
    const items: GridFlatItem[] = [];
    const stickyIndices: number[] = [];
    for (const section of sections) {
      if (showSetHeaders) {
        stickyIndices.push(items.length);
        items.push({
          type: 'set',
          key: `set_${section.setId}`,
          label: section.setLabel,
          count: section.count,
          owned: ownedBySet?.[section.setId],
        });
      }
      for (const band of section.bands) {
        stickyIndices.push(items.length);
        items.push({
          type: 'band',
          key: `band_${section.setId}_${band.key}`,
          label: band.label,
          dot: band.dot,
          count: band.cards.length,
          setLabel: showSetHeaders ? section.setLabel : undefined,
        });
        chunkRows(band.cards, numColumns).forEach((rowCards, i) => {
          items.push({
            type: 'row',
            key: `row_${section.setId}_${band.key}_${i}`,
            cards: rowCards,
          });
        });
      }
    }
    return { items, stickyIndices };
  }, [sections, showSetHeaders, ownedBySet, numColumns]);

  const renderTile = (item: FilteredCard) => {
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

  const renderRow = (rowCards: FilteredCard[]) => (
    <View className="flex-row" style={{ marginBottom: GRID_GAP }}>
      {rowCards.map((card, i) => (
        <View
          key={card._listKey ?? card.id}
          style={{
            width: tileWidth,
            marginRight: i === rowCards.length - 1 ? 0 : GRID_GAP,
          }}>
          {renderTile(card)}
        </View>
      ))}
    </View>
  );

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

  const emptyGrid = (
    <View className="items-center py-12">
      <Text className="text-center text-neutral-500">{emptyMessage}</Text>
    </View>
  );

  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
  ) : undefined;

  if (Platform.OS === 'web') {
    // Scoped CSS sticky: set headers pin at the top, band headers pin just
    // below, and the next section pushes them out.
    const stickyBand = showSetHeaders ? WEB_STICKY_BAND_BELOW_SET : WEB_STICKY_BAND_TOP;
    return (
      <View className="flex-1 bg-white dark:bg-neutral-950">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
          refreshControl={refreshControl}>
          {ListHeaderComponent}
          {sections.length === 0 ? emptyGrid : null}
          {sections.map((section) => (
            <View key={section.setId}>
              {showSetHeaders ? (
                <View style={WEB_STICKY_SET}>
                  <SetHeader
                    label={section.setLabel}
                    count={section.count}
                    owned={ownedBySet?.[section.setId]}
                  />
                </View>
              ) : null}
              {section.bands.map((band) => (
                <View key={band.key}>
                  <View style={stickyBand}>
                    <DomainBandHeader label={band.label} dot={band.dot} count={band.cards.length} />
                  </View>
                  <View style={{ marginTop: GRID_GAP }}>
                    {chunkRows(band.cards, numColumns).map((rowCards, i) => (
                      <View key={`${section.setId}_${band.key}_${i}`}>{renderRow(rowCards)}</View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  const renderFlatItem = (item: GridFlatItem): ReactNode => {
    if (item.type === 'set') {
      return <SetHeader label={item.label} count={item.count} owned={item.owned} />;
    }
    if (item.type === 'band') {
      return (
        <DomainBandHeader
          label={item.label}
          dot={item.dot}
          count={item.count}
          setLabel={item.setLabel}
        />
      );
    }
    return renderRow(item.cards);
  };

  return (
    <View className="flex-1 bg-white dark:bg-neutral-950">
      <FlashList
        data={flat.items}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        stickyHeaderIndices={flat.stickyIndices}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
        ListHeaderComponent={ListHeaderComponent ?? undefined}
        ListEmptyComponent={emptyGrid}
        onRefresh={onRefresh}
        refreshing={onRefresh ? isRefreshing : undefined}
        renderItem={({ item }) => <>{renderFlatItem(item)}</>}
      />
    </View>
  );
}
