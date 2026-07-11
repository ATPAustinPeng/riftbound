import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
import { memo, useMemo, type ReactElement } from 'react';
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

import {
  DomainBandHeader,
  SetHeader,
  WEB_STICKY_BAND_BELOW_SET,
  WEB_STICKY_BAND_TOP,
  WEB_STICKY_SET,
} from '@/components/section-headers';
import {
  buildSetSections,
  RARITY_BUCKETS,
  type DomainBand,
  type SetSection,
} from '@/lib/card-sections';
import {
  canBeFoil,
  collectorNumberDisplay,
  DOMAIN_COLORS,
  evaluateGoal,
  type CardsIndex,
  type CollectionGoal,
  type FilteredCard,
} from '@/lib/queries';

const HORIZONTAL_PADDING = 16;

type ListItem =
  | { type: 'set'; key: string; label: string; count: number; owned?: number }
  | {
      type: 'domain';
      key: string;
      bandStateKey: string;
      label: string;
      dot?: string;
      tint?: string;
      count: number;
      setLabel?: string;
      collapsed: boolean;
    }
  | {
      type: 'rarity';
      key: string;
      label: string;
      count: number;
      domainLabel: string;
      dot?: string;
    }
  | { type: 'card'; key: string; card: FilteredCard; hideDomains: boolean };

function flattenSections(
  sections: SetSection[],
  showSetHeaders: boolean,
  ownedBySet?: Record<string, number>,
  collapsedBands?: Record<string, boolean>,
): {
  items: ListItem[];
  stickyIndices: number[];
} {
  const items: ListItem[] = [];
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
      const bandStateKey = `${section.setId}_${band.key}`;
      const collapsed = !!collapsedBands?.[bandStateKey];
      stickyIndices.push(items.length);
      items.push({
        type: 'domain',
        key: `domain_${section.setId}_${band.key}`,
        bandStateKey,
        label: band.label,
        dot: band.dot,
        tint: band.tint,
        count: band.cards.length,
        setLabel: showSetHeaders ? section.setLabel : undefined,
        collapsed,
      });
      if (collapsed) continue;
      for (const { bucket, label } of RARITY_BUCKETS) {
        const bucketCards = band.byRarity[bucket];
        if (bucketCards.length === 0) continue;
        stickyIndices.push(items.length);
        items.push({
          type: 'rarity',
          key: `rarity_${section.setId}_${band.key}_${bucket}`,
          label,
          count: bucketCards.length,
          domainLabel: band.label,
          dot: band.dot,
        });
        for (const card of bucketCards) {
          items.push({
            type: 'card',
            key: card._listKey ?? card.id,
            card,
            hideDomains: band.singleDomain,
          });
        }
      }
    }
  }
  return { items, stickyIndices };
}

function chunkIntoRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function RarityColumnHeader({ label, count }: { label: string; count: number }) {
  return (
    <View
      className={`flex-row items-center gap-1.5 bg-white pb-1 pt-3 dark:bg-neutral-950 ${count === 0 ? 'opacity-40' : ''}`}>
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </Text>
      <Text className="text-xs text-neutral-400 dark:text-neutral-500">· {count}</Text>
    </View>
  );
}

function RaritySubheader({
  label,
  count,
  domainLabel,
  dot,
}: {
  label: string;
  count: number;
  domainLabel: string;
  dot?: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5 bg-white pb-1 pt-3 dark:bg-neutral-950">
      {dot ? <View className={`h-2.5 w-2.5 rounded-full ${dot}`} /> : null}
      <Text className="text-xs font-medium uppercase tracking-wide text-neutral-300 dark:text-neutral-600">
        {domainLabel} /
      </Text>
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </Text>
      <Text className="text-xs text-neutral-400 dark:text-neutral-500">· {count}</Text>
    </View>
  );
}

interface CardListViewProps {
  cards: FilteredCard[];
  index: CardsIndex;
  ownedByCardId?: Record<string, number>;
  foilOwnedByCardId?: Record<string, number>;
  quantityMode: 'owned' | 'needed';
  goal?: CollectionGoal;
  quickAdd?: boolean;
  onOwnedChange?: (cardId: string, next: number) => void;
  onFoilOwnedChange?: (cardId: string, next: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  emptyMessage?: string;
  ListHeaderComponent?: ReactElement | null;
  dimMissing?: boolean;
  collapsedBands?: Record<string, boolean>;
  onToggleBand?: (key: string) => void;
}

function CompactButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`h-6 w-6 items-center justify-center rounded border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900 ${disabled ? 'opacity-40' : ''}`}>
      <Text className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{label}</Text>
    </Pressable>
  );
}

function ProgressRow({
  label,
  owned,
  target,
  onDecrement,
  onIncrement,
  showControls,
}: {
  label: string;
  owned: number;
  target: number;
  onDecrement?: () => void;
  onIncrement?: () => void;
  showControls: boolean;
}) {
  const capped = Math.min(owned, target);
  const complete = owned >= target;

  return (
    <View className="gap-0.5">
      <View className="flex-row items-center gap-1.5">
        <Text className="w-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </Text>
        <View className="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <View
            className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${target > 0 ? (capped / target) * 100 : 0}%` }}
          />
        </View>
        <Text className="text-xs font-semibold tabular-nums text-neutral-700 dark:text-neutral-300">
          {capped}/{target}
        </Text>
        {showControls ? (
          <View className="flex-row items-center gap-0.5">
            <CompactButton label="−" disabled={owned <= 0} onPress={() => onDecrement?.()} />
            <CompactButton label="+" onPress={() => onIncrement?.()} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const CardListRow = memo(function CardListRow({
  card,
  index,
  owned,
  foilOwned,
  quantityMode,
  goal,
  quickAdd,
  dimMissing,
  hideDomains,
  onOwnedChange,
  onFoilOwnedChange,
}: {
  card: FilteredCard;
  index: CardsIndex;
  owned: number;
  foilOwned: number;
  quantityMode: 'owned' | 'needed';
  goal?: CollectionGoal;
  quickAdd?: boolean;
  dimMissing?: boolean;
  hideDomains?: boolean;
  onOwnedChange?: (cardId: string, next: number) => void;
  onFoilOwnedChange?: (cardId: string, next: number) => void;
}) {
  const cardCanFoil = canBeFoil(card);
  const collectorNumber = collectorNumberDisplay(card);
  const domains = index.domainsByCardId[card.id] ?? [];
  const showControls = quickAdd && (!!onOwnedChange || !!onFoilOwnedChange);
  const evaluation = goal ? evaluateGoal(goal, owned, foilOwned, card) : null;
  const dimmed = dimMissing && owned + foilOwned === 0;
  const showFoilTrack = evaluation ? evaluation.foilTarget > 0 : cardCanFoil;

  return (
    <View className="flex-row items-center gap-2 border-b border-neutral-100 py-2.5 dark:border-neutral-900">
      <Link href={`/card/${card.id}`} asChild>
        <Pressable className={`min-w-0 flex-1 ${dimmed ? 'opacity-40' : ''}`}>
          <Text
            className="text-sm font-medium text-neutral-900 dark:text-white"
            numberOfLines={2}>
            {card.name}
          </Text>
          {!hideDomains && domains.length > 0 ? (
            <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
              {domains.map((d) => {
                const color = DOMAIN_COLORS[d.domain_id];
                if (!color) return null;
                return (
                  <View key={d.domain_id} className="flex-row items-center gap-1">
                    <View className={`h-2 w-2 rounded-full ${color.dot}`} />
                    <Text className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      {color.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          {collectorNumber ? (
            <Text className="mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500">
              #{collectorNumber}
            </Text>
          ) : null}
        </Pressable>
      </Link>

      <View className="items-end gap-1">
        {quantityMode === 'owned' ? (
          showControls ? (
            // Two fixed columns (normal, foil) each stacking its count above
            // its own buttons; counts keep a fixed height when empty and
            // non-foilable cards render invisible foil controls, so every row
            // lays out identically.
            <View className="flex-row items-end gap-2">
              {onOwnedChange ? (
                <View className="items-end gap-1">
                  <Text className="h-4 text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                    {owned > 0 ? `×${owned}` : ''}
                  </Text>
                  <View className="flex-row items-center gap-0.5">
                    <CompactButton
                      label="−"
                      disabled={owned <= 0}
                      onPress={() => onOwnedChange(card.id, owned - 1)}
                    />
                    <CompactButton
                      label="+"
                      onPress={() => onOwnedChange(card.id, owned + 1)}
                    />
                  </View>
                </View>
              ) : null}
              {onFoilOwnedChange ? (
                <View
                  pointerEvents={cardCanFoil ? 'auto' : 'none'}
                  className={`items-end gap-1 ${cardCanFoil ? '' : 'opacity-0'}`}>
                  <Text className="h-4 text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {cardCanFoil && foilOwned > 0 ? `✦×${foilOwned}` : ''}
                  </Text>
                  <View className="flex-row items-center gap-0.5">
                    {/* invisible ✦ keeps the gap between the two button pairs */}
                    <Text className="text-[10px] opacity-0">✦</Text>
                    <CompactButton
                      label="−"
                      disabled={foilOwned <= 0}
                      onPress={() => onFoilOwnedChange(card.id, foilOwned - 1)}
                    />
                    <CompactButton
                      label="+"
                      onPress={() => onFoilOwnedChange(card.id, foilOwned + 1)}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View className="flex-row items-center">
              <Text className="h-4 w-8 text-right text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {owned > 0 ? `×${owned}` : ''}
              </Text>
              <Text className="h-4 w-10 text-right text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {cardCanFoil && foilOwned > 0 ? `✦×${foilOwned}` : ''}
              </Text>
            </View>
          )
        ) : (
          <>
            <ProgressRow
              label=""
              owned={owned}
              target={evaluation?.target ?? 3}
              showControls={!!(showControls && onOwnedChange)}
              onDecrement={() => onOwnedChange?.(card.id, owned - 1)}
              onIncrement={() => onOwnedChange?.(card.id, owned + 1)}
            />
            {showFoilTrack ? (
              <ProgressRow
                label="✦"
                owned={foilOwned}
                target={evaluation?.foilTarget ?? 3}
                showControls={!!(showControls && onFoilOwnedChange)}
                onDecrement={() => onFoilOwnedChange?.(card.id, foilOwned - 1)}
                onIncrement={() => onFoilOwnedChange?.(card.id, foilOwned + 1)}
              />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
});

export function CardListView({
  cards,
  index,
  ownedByCardId,
  foilOwnedByCardId,
  quantityMode,
  goal,
  quickAdd = false,
  onOwnedChange,
  onFoilOwnedChange,
  isLoading = false,
  isError = false,
  onRetry,
  onRefresh,
  isRefreshing = false,
  emptyMessage = 'No cards match your filters.',
  ListHeaderComponent,
  dimMissing = false,
  collapsedBands,
  onToggleBand,
}: CardListViewProps) {
  const { width } = useWindowDimensions();
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
  const flat = useMemo(
    () => flattenSections(sections, showSetHeaders, ownedBySet, collapsedBands),
    [sections, showSetHeaders, ownedBySet, collapsedBands],
  );
  const useSingleColumn = width < 640;
  // Rarity columns per row: all four side by side on wide screens, 2×2 in between.
  const bucketsPerRow = width >= 1024 ? 4 : 2;

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

  const renderCardRow = (card: FilteredCard, hideDomains: boolean) => (
    <CardListRow
      key={card._listKey ?? card.id}
      card={card}
      index={index}
      owned={ownedByCardId?.[card.id] ?? 0}
      foilOwned={foilOwnedByCardId?.[card.id] ?? 0}
      quantityMode={quantityMode}
      goal={goal}
      quickAdd={quickAdd}
      dimMissing={dimMissing}
      hideDomains={hideDomains}
      onOwnedChange={onOwnedChange}
      onFoilOwnedChange={onFoilOwnedChange}
    />
  );

  const emptyList = (
    <View className="items-center py-12">
      <Text className="text-center text-neutral-500">{emptyMessage}</Text>
    </View>
  );

  if (useSingleColumn) {
    return (
      <View className="flex-1 bg-white dark:bg-neutral-950">
        <FlashList
          data={flat.items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          stickyHeaderIndices={flat.stickyIndices}
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
          ListHeaderComponent={ListHeaderComponent ?? undefined}
          ListEmptyComponent={emptyList}
          onRefresh={onRefresh}
          refreshing={onRefresh ? isRefreshing : undefined}
          renderItem={({ item }) => {
            if (item.type === 'set') {
              return <SetHeader label={item.label} count={item.count} owned={item.owned} />;
            }
            if (item.type === 'domain') {
              return (
                <DomainBandHeader
                  label={item.label}
                  dot={item.dot}
                  tint={item.tint}
                  count={item.count}
                  setLabel={item.setLabel}
                  collapsed={item.collapsed}
                  onToggle={onToggleBand ? () => onToggleBand(item.bandStateKey) : undefined}
                />
              );
            }
            if (item.type === 'rarity') {
              return (
                <RaritySubheader
                  label={item.label}
                  count={item.count}
                  domainLabel={item.domainLabel}
                  dot={item.dot}
                />
              );
            }
            return renderCardRow(item.card, item.hideDomains);
          }}
        />
      </View>
    );
  }

  // Each rarity bucket is its own column of stacked card rows; the domain band
  // header above spans all of them, so it stays outside the columns. The
  // symmetric inset centers the columns under the band header's width so they
  // read as nested inside the band.
  const renderBandColumns = (band: DomainBand) => (
    <View className="px-5">
      {chunkIntoRows(RARITY_BUCKETS, bucketsPerRow).map((rowBuckets, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-6">
          {rowBuckets.map(({ bucket, label }) => {
            const bucketCards = band.byRarity[bucket];
            return (
              <View key={bucket} className="min-w-0 flex-1">
                <RarityColumnHeader label={label} count={bucketCards.length} />
                {bucketCards.map((card) => renderCardRow(card, band.singleDomain))}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );

  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
  ) : undefined;

  if (Platform.OS === 'web') {
    // CSS position: sticky supports two-level stacking: the set header pins at
    // the top, domain band headers pin just below it, and each is scoped to its
    // section container so the next section pushes them out.
    const stickyDomain = showSetHeaders ? WEB_STICKY_BAND_BELOW_SET : WEB_STICKY_BAND_TOP;
    return (
      <View className="flex-1 bg-white dark:bg-neutral-950">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
          refreshControl={refreshControl}>
          {ListHeaderComponent}
          {sections.length === 0 ? emptyList : null}
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
              {section.bands.map((band) => {
                const bandStateKey = `${section.setId}_${band.key}`;
                const collapsed = !!collapsedBands?.[bandStateKey];
                return (
                  <View key={band.key}>
                    <View style={stickyDomain}>
                      <DomainBandHeader
                        label={band.label}
                        dot={band.dot}
                        tint={band.tint}
                        count={band.cards.length}
                        collapsed={collapsed}
                        onToggle={onToggleBand ? () => onToggleBand(bandStateKey) : undefined}
                      />
                    </View>
                    {collapsed ? null : renderBandColumns(band)}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Native ScrollView sticky headers must be direct children, and only one
  // sticks at a time (the next header pushes the previous off), so the section
  // tree is flattened and domain headers carry their set label for context.
  const wideChildren: ReactElement[] = [];
  const wideStickyIndices: number[] = [];
  if (ListHeaderComponent) {
    wideChildren.push(<View key="list-header">{ListHeaderComponent}</View>);
  }
  if (sections.length === 0) {
    wideChildren.push(<View key="empty">{emptyList}</View>);
  }
  for (const section of sections) {
    if (showSetHeaders) {
      wideStickyIndices.push(wideChildren.length);
      wideChildren.push(
        <SetHeader
          key={`set_${section.setId}`}
          label={section.setLabel}
          count={section.count}
          owned={ownedBySet?.[section.setId]}
        />,
      );
    }
    for (const band of section.bands) {
      const bandStateKey = `${section.setId}_${band.key}`;
      const collapsed = !!collapsedBands?.[bandStateKey];
      wideStickyIndices.push(wideChildren.length);
      wideChildren.push(
        <DomainBandHeader
          key={`domain_${section.setId}_${band.key}`}
          label={band.label}
          dot={band.dot}
          tint={band.tint}
          count={band.cards.length}
          setLabel={showSetHeaders ? section.setLabel : undefined}
          collapsed={collapsed}
          onToggle={onToggleBand ? () => onToggleBand(bandStateKey) : undefined}
        />,
      );
      if (!collapsed) {
        wideChildren.push(
          <View key={`cards_${section.setId}_${band.key}`}>{renderBandColumns(band)}</View>,
        );
      }
    }
  }

  return (
    <View className="flex-1 bg-white dark:bg-neutral-950">
      <ScrollView
        className="flex-1"
        stickyHeaderIndices={wideStickyIndices}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
        refreshControl={refreshControl}>
        {wideChildren}
      </ScrollView>
    </View>
  );
}
