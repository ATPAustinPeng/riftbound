import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  canBeFoil,
  DOMAIN_COLORS,
  evaluateGoal,
  type CardsIndex,
  type CollectionGoal,
  type FilteredCard,
} from '@/lib/queries';

const HORIZONTAL_PADDING = 16;

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
  onOwnedChange?: (cardId: string, next: number) => void;
  onFoilOwnedChange?: (cardId: string, next: number) => void;
}) {
  const cardCanFoil = canBeFoil(card);
  const domains = index.domainsByCardId[card.id] ?? [];
  const showControls = quickAdd && (!!onOwnedChange || !!onFoilOwnedChange);
  const evaluation = goal
    ? evaluateGoal(goal, owned, foilOwned, cardCanFoil, card.card_type)
    : null;
  const dimmed = dimMissing && owned + foilOwned === 0;
  const foilMissing =
    dimMissing &&
    !dimmed &&
    cardCanFoil &&
    evaluation &&
    evaluation.normalComplete &&
    !evaluation.foilComplete;

  return (
    <View
      className={`flex-row items-center gap-2 border-b border-neutral-100 py-2.5 dark:border-neutral-900 ${dimmed ? 'opacity-40' : ''}`}>
      <Link href={`/card/${card.id}`} asChild>
        <Pressable className="min-w-0 flex-1">
          <Text
            className="text-sm font-medium text-neutral-900 dark:text-white"
            numberOfLines={2}>
            {card.name}
          </Text>
          {domains.length > 0 ? (
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
          {card.collector_number ? (
            <Text className="mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500">
              #{card.collector_number}
            </Text>
          ) : null}
        </Pressable>
      </Link>

      <View className="items-end gap-1">
        {foilMissing ? (
          <View className="rounded-full border border-dashed border-amber-400 px-1.5 py-0.5 opacity-40">
            <Text className="text-[10px] font-bold leading-none text-amber-500">✦</Text>
          </View>
        ) : null}
        {quantityMode === 'owned' ? (
          <>
            <View className="flex-row items-center gap-1">
              {owned > 0 ? (
                <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                  ×{owned}
                </Text>
              ) : null}
              {cardCanFoil && foilOwned > 0 ? (
                <Text className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  ✦×{foilOwned}
                </Text>
              ) : null}
            </View>
            {showControls ? (
              <View className="flex-row items-center gap-2">
                {onOwnedChange ? (
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
                ) : null}
                {cardCanFoil && onFoilOwnedChange ? (
                  <View className="flex-row items-center gap-0.5">
                    <Text className="text-[10px] text-amber-600 dark:text-amber-400">✦</Text>
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
                ) : null}
              </View>
            ) : null}
          </>
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
            {cardCanFoil && goal !== 'playset_normal' ? (
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
  emptyMessage = 'No cards match your filters.',
  ListHeaderComponent,
  dimMissing = false,
}: CardListViewProps) {
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
        keyExtractor={(item) => item._listKey ?? item.id}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
        ListHeaderComponent={ListHeaderComponent ?? undefined}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-center text-neutral-500">{emptyMessage}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <CardListRow
            card={item}
            index={index}
            owned={ownedByCardId?.[item.id] ?? 0}
            foilOwned={foilOwnedByCardId?.[item.id] ?? 0}
            quantityMode={quantityMode}
            goal={goal}
            quickAdd={quickAdd}
            dimMissing={dimMissing}
            onOwnedChange={onOwnedChange}
            onFoilOwnedChange={onFoilOwnedChange}
          />
        )}
      />
    </View>
  );
}
