import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
import { useMemo, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import {
  canBeFoil,
  collectorNumberDisplay,
  DOMAIN_COLOR_ORDER,
  DOMAIN_COLORS,
  evaluateGoal,
  type CardsIndex,
  type CollectionGoal,
  type FilteredCard,
} from '@/lib/queries';

const HORIZONTAL_PADDING = 16;

// Fixed so web domain headers know where to stick below the rarity header.
const RARITY_HEADER_HEIGHT = 52;

// react-native-web supports position: 'sticky' but RN's style types don't include it.
const WEB_STICKY_RARITY = { position: 'sticky', top: 0, zIndex: 20 } as unknown as ViewStyle;
const WEB_STICKY_DOMAIN = {
  position: 'sticky',
  top: RARITY_HEADER_HEIGHT,
  zIndex: 10,
} as unknown as ViewStyle;

type RarityBucket = 'common' | 'uncommon' | 'rare' | 'epicPlus';

interface RarityBuckets {
  common: FilteredCard[];
  uncommon: FilteredCard[];
  rare: FilteredCard[];
  epicPlus: FilteredCard[];
}

const RARITY_SECTIONS: Array<{ bucket: RarityBucket; label: string }> = [
  { bucket: 'common', label: 'Common' },
  { bucket: 'uncommon', label: 'Uncommon' },
  { bucket: 'rare', label: 'Rare' },
  { bucket: 'epicPlus', label: 'Epic+' },
];

interface DomainGroup {
  key: string;
  label: string;
  dot?: string;
  singleDomain: boolean;
  cards: FilteredCard[];
}

interface RaritySection {
  bucket: RarityBucket;
  label: string;
  count: number;
  groups: DomainGroup[];
}

type ListItem =
  | { type: 'rarity'; key: string; label: string; count: number }
  | {
      type: 'domain';
      key: string;
      label: string;
      dot?: string;
      count: number;
      rarityLabel: string;
    }
  | { type: 'card'; key: string; card: FilteredCard; hideDomains: boolean };

function partitionByRarity(cards: FilteredCard[]): RarityBuckets {
  const buckets: RarityBuckets = { common: [], uncommon: [], rare: [], epicPlus: [] };
  for (const card of cards) {
    if (card.rarity_id === 'common') buckets.common.push(card);
    else if (card.rarity_id === 'uncommon') buckets.uncommon.push(card);
    else if (card.rarity_id === 'rare') buckets.rare.push(card);
    else buckets.epicPlus.push(card);
  }
  return buckets;
}

function groupByDomain(cards: FilteredCard[], index: CardsIndex): DomainGroup[] {
  const byKey = new Map<string, FilteredCard[]>();
  for (const card of cards) {
    const ids = Array.from(
      new Set((index.domainsByCardId[card.id] ?? []).map((d) => d.domain_id)),
    );
    const key = ids.length === 0 ? 'none' : ids.length > 1 ? 'multi' : ids[0];
    const list = byKey.get(key);
    if (list) list.push(card);
    else byKey.set(key, [card]);
  }

  const groups: DomainGroup[] = [];
  const singleIds = Object.keys(DOMAIN_COLOR_ORDER).sort(
    (a, b) => DOMAIN_COLOR_ORDER[a] - DOMAIN_COLOR_ORDER[b],
  );
  for (const id of singleIds) {
    const groupCards = byKey.get(id);
    if (!groupCards) continue;
    byKey.delete(id);
    groups.push({
      key: id,
      label: DOMAIN_COLORS[id]?.label ?? id,
      dot: DOMAIN_COLORS[id]?.dot,
      singleDomain: true,
      cards: groupCards,
    });
  }
  const multi = byKey.get('multi');
  const none = byKey.get('none');
  byKey.delete('multi');
  byKey.delete('none');
  for (const [id, groupCards] of byKey) {
    groups.push({ key: id, label: id, singleDomain: true, cards: groupCards });
  }
  if (multi) groups.push({ key: 'multi', label: 'Multi-Domain', singleDomain: false, cards: multi });
  if (none) groups.push({ key: 'none', label: 'No Domain', singleDomain: false, cards: none });
  return groups;
}

function buildSections(cards: FilteredCard[], index: CardsIndex): RaritySection[] {
  const buckets = partitionByRarity(cards);
  const sections: RaritySection[] = [];
  for (const { bucket, label } of RARITY_SECTIONS) {
    const bucketCards = buckets[bucket];
    if (bucketCards.length === 0) continue;
    sections.push({
      bucket,
      label,
      count: bucketCards.length,
      groups: groupByDomain(bucketCards, index),
    });
  }
  return sections;
}

function flattenSections(sections: RaritySection[]): {
  items: ListItem[];
  stickyIndices: number[];
} {
  const items: ListItem[] = [];
  const stickyIndices: number[] = [];
  for (const section of sections) {
    stickyIndices.push(items.length);
    items.push({
      type: 'rarity',
      key: `rarity_${section.bucket}`,
      label: section.label,
      count: section.count,
    });
    for (const group of section.groups) {
      stickyIndices.push(items.length);
      items.push({
        type: 'domain',
        key: `domain_${section.bucket}_${group.key}`,
        label: group.label,
        dot: group.dot,
        count: group.cards.length,
        rarityLabel: section.label,
      });
      for (const card of group.cards) {
        items.push({
          type: 'card',
          key: card._listKey ?? card.id,
          card,
          hideDomains: group.singleDomain,
        });
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

function RarityHeader({ label, count }: { label: string; count: number }) {
  return (
    <View
      style={{ height: RARITY_HEADER_HEIGHT }}
      className="flex-row items-end gap-2 border-b border-neutral-200 bg-white pb-2 dark:border-neutral-800 dark:bg-neutral-950">
      <Text className="text-base font-bold text-neutral-900 dark:text-white">{label}</Text>
      <Text className="pb-0.5 text-xs text-neutral-400 dark:text-neutral-500">{count}</Text>
    </View>
  );
}

function DomainHeader({
  label,
  dot,
  count,
  rarityLabel,
}: {
  label: string;
  dot?: string;
  count: number;
  rarityLabel?: string;
}) {
  return (
    <View className="flex-row items-center gap-1.5 bg-white pb-1 pt-3 dark:bg-neutral-950">
      {rarityLabel ? (
        <Text className="text-xs font-medium uppercase tracking-wide text-neutral-300 dark:text-neutral-600">
          {rarityLabel} /
        </Text>
      ) : null}
      {dot ? <View className={`h-2.5 w-2.5 rounded-full ${dot}`} /> : null}
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
        <Text className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
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

function CardListRow({
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
  const evaluation = goal
    ? evaluateGoal(goal, owned, foilOwned, cardCanFoil, card.card_type)
    : null;
  const dimmed = dimMissing && owned + foilOwned === 0;
  const showFoilTrack = cardCanFoil && goal !== 'playset_normal';

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
                  <Text className="h-4 text-xs font-semibold text-blue-600 dark:text-blue-400">
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
                  <Text className="h-4 text-xs font-semibold text-amber-600 dark:text-amber-400">
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
              <Text className="h-4 w-8 text-right text-xs font-semibold text-blue-600 dark:text-blue-400">
                {owned > 0 ? `×${owned}` : ''}
              </Text>
              <Text className="h-4 w-10 text-right text-xs font-semibold text-amber-600 dark:text-amber-400">
                {cardCanFoil && foilOwned > 0 ? `✦×${foilOwned}` : ''}
              </Text>
            </View>
          )
        ) : evaluation?.untracked ? null : evaluation?.combined ? (
          <ProgressRow
            label=""
            owned={owned + foilOwned}
            target={evaluation.target}
            showControls={!!(showControls && onOwnedChange)}
            onDecrement={() => {
              if (foilOwned > 0) {
                onFoilOwnedChange?.(card.id, foilOwned - 1);
              } else {
                onOwnedChange?.(card.id, owned - 1);
              }
            }}
            onIncrement={() => onOwnedChange?.(card.id, owned + 1)}
          />
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
                target={evaluation?.target ?? 3}
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
}

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
}: CardListViewProps) {
  const { width } = useWindowDimensions();
  const sections = useMemo(() => buildSections(cards, index), [cards, index]);
  const flat = useMemo(() => flattenSections(sections), [sections]);
  const useSingleColumn = width < 640;
  const columnCount = width >= 1024 ? 3 : 2;

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
            if (item.type === 'rarity') {
              return <RarityHeader label={item.label} count={item.count} />;
            }
            if (item.type === 'domain') {
              return (
                <DomainHeader
                  label={item.label}
                  dot={item.dot}
                  count={item.count}
                  rarityLabel={item.rarityLabel}
                />
              );
            }
            return renderCardRow(item.card, item.hideDomains);
          }}
        />
      </View>
    );
  }

  const renderGroupColumns = (group: DomainGroup) => (
    <View>
      {chunkIntoRows(group.cards, columnCount).map((rowCards, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-6">
          {rowCards.map((card) => (
            <View key={card._listKey ?? card.id} className="flex-1">
              {renderCardRow(card, group.singleDomain)}
            </View>
          ))}
          {rowCards.length < columnCount
            ? Array.from({ length: columnCount - rowCards.length }).map((_, padIndex) => (
                <View key={`pad_${padIndex}`} className="flex-1" />
              ))
            : null}
        </View>
      ))}
    </View>
  );

  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
  ) : undefined;

  if (Platform.OS === 'web') {
    // CSS position: sticky supports two-level stacking: the rarity header pins
    // at the top, domain headers pin just below it, and each is scoped to its
    // section container so the next section pushes them out.
    return (
      <View className="flex-1 bg-white dark:bg-neutral-950">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
          refreshControl={refreshControl}>
          {ListHeaderComponent}
          {sections.length === 0 ? emptyList : null}
          {sections.map((section) => (
            <View key={section.bucket}>
              <View style={WEB_STICKY_RARITY}>
                <RarityHeader label={section.label} count={section.count} />
              </View>
              {section.groups.map((group) => (
                <View key={group.key}>
                  <View style={WEB_STICKY_DOMAIN}>
                    <DomainHeader label={group.label} dot={group.dot} count={group.cards.length} />
                  </View>
                  {renderGroupColumns(group)}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Native ScrollView sticky headers must be direct children, and only one
  // sticks at a time (the next header pushes the previous off), so the section
  // tree is flattened and domain headers carry their rarity label for context.
  const wideChildren: ReactElement[] = [];
  const wideStickyIndices: number[] = [];
  if (ListHeaderComponent) {
    wideChildren.push(<View key="list-header">{ListHeaderComponent}</View>);
  }
  if (sections.length === 0) {
    wideChildren.push(<View key="empty">{emptyList}</View>);
  }
  for (const section of sections) {
    wideStickyIndices.push(wideChildren.length);
    wideChildren.push(
      <RarityHeader
        key={`rarity_${section.bucket}`}
        label={section.label}
        count={section.count}
      />,
    );
    for (const group of section.groups) {
      wideStickyIndices.push(wideChildren.length);
      wideChildren.push(
        <DomainHeader
          key={`domain_${section.bucket}_${group.key}`}
          label={group.label}
          dot={group.dot}
          count={group.cards.length}
          rarityLabel={section.label}
        />,
      );
      wideChildren.push(
        <View key={`cards_${section.bucket}_${group.key}`}>{renderGroupColumns(group)}</View>,
      );
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
