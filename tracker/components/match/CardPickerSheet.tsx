import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { Card } from '@/lib/types';
import { cn } from '@/lib/utils';

interface CardPickerSheetProps {
  visible: boolean;
  title: string;
  cards: Card[];
  selectedCardId?: string | null;
  disabledCardIds?: string[];
  /** Optional per-card disabled tag (e.g. "used G1"). A defined reason also disables the row. */
  disabledReason?: (card: Card) => string | undefined;
  onSelect: (card: Card) => void;
  onClose: () => void;
  allowClear?: boolean;
  onClear?: () => void;
}

/** Small card-image thumbnail used by picker rows and picker fields. */
export function CardThumb({ card, className }: { card: Card | null; className?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <View
      className={cn(
        'bg-muted h-12 w-9 items-center justify-center overflow-hidden rounded',
        className,
      )}>
      {card?.image_url && !failed ? (
        <Image
          source={{ uri: card.image_url }}
          accessibilityLabel={card.image_alt ?? card.name}
          className="h-full w-full"
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text className="text-muted-foreground text-xs font-semibold">
          {card?.name?.[0] ?? '?'}
        </Text>
      )}
    </View>
  );
}

/**
 * Labeled field that shows the current selection (thumbnail + name, or a
 * placeholder) and calls `onPress` to open a {@link CardPickerSheet}. Shared
 * by LegendPicker / BattlefieldPicker.
 */
export function CardPickerField({
  label,
  selectedCard,
  placeholder,
  onPress,
}: {
  label: string;
  selectedCard: Card | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-muted-foreground text-sm font-medium">{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedCard ? selectedCard.name : placeholder}`}
        className="border-border bg-card active:bg-accent min-h-14 flex-row items-center gap-3 rounded-md border px-3 py-1.5">
        {selectedCard ? <CardThumb card={selectedCard} className="h-10 w-[30px]" /> : null}
        <Text
          numberOfLines={1}
          className={cn(
            'flex-1 text-base',
            selectedCard ? 'text-foreground font-medium' : 'text-muted-foreground',
          )}>
          {selectedCard ? selectedCard.name : placeholder}
        </Text>
        <Text className="text-muted-foreground text-lg">›</Text>
      </Pressable>
    </View>
  );
}

/**
 * Generic bottom-sheet card picker (legends, battlefields, …). Presentational:
 * the parent owns `visible` and closes the sheet from `onSelect` / `onClear`.
 */
export function CardPickerSheet({
  visible,
  title,
  cards,
  selectedCardId,
  disabledCardIds,
  disabledReason,
  onSelect,
  onClose,
  allowClear = false,
  onClear,
}: CardPickerSheetProps) {
  const [query, setQuery] = useState('');

  // Fresh search each time the sheet opens.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const disabledIds = useMemo(() => new Set(disabledCardIds ?? []), [disabledCardIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((card) => card.name.toLowerCase().includes(q));
  }, [cards, query]);

  function handleSelect(card: Card) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(card);
  }

  function handleClear() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClear?.();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="bg-card h-[85%] rounded-t-2xl"
          onPress={(e) => e.stopPropagation()}>
          <View className="border-border flex-row items-center justify-between border-b px-4 py-3">
            <Text className="text-foreground text-lg font-semibold">{title}</Text>
            <Pressable onPress={onClose} className="rounded-full px-3 py-1" hitSlop={8}>
              <Text className="text-primary text-sm font-medium">Close</Text>
            </Pressable>
          </View>

          <View className="px-4 py-3">
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name…"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(card) => card.id}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-4 pb-8"
            ListHeaderComponent={
              allowClear ? (
                <Pressable
                  onPress={handleClear}
                  className="border-border active:bg-accent mb-1 flex-row items-center gap-3 rounded-lg border border-dashed px-3 py-2.5">
                  <Text className="text-muted-foreground flex-1 text-base">
                    Clear selection (Unknown)
                  </Text>
                  {selectedCardId == null ? (
                    <Text className="text-primary text-base font-bold">✓</Text>
                  ) : null}
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <Text className="text-muted-foreground py-8 text-center text-sm">
                No cards match “{query.trim()}”
              </Text>
            }
            renderItem={({ item: card }) => {
              const reason = disabledReason?.(card);
              const disabled = disabledIds.has(card.id) || reason !== undefined;
              const selected = selectedCardId === card.id;
              return (
                <Pressable
                  disabled={disabled}
                  onPress={() => handleSelect(card)}
                  className={cn(
                    'flex-row items-center gap-3 rounded-lg px-2 py-2',
                    selected && 'bg-accent',
                    !disabled && 'active:bg-accent',
                    disabled && 'opacity-40',
                  )}>
                  <CardThumb card={card} />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-foreground text-base font-medium">
                      {card.name}
                    </Text>
                    <Text numberOfLines={1} className="text-muted-foreground text-xs">
                      {card.set_name}
                    </Text>
                  </View>
                  {reason ? (
                    <View className="border-border bg-muted rounded-full border px-2 py-0.5">
                      <Text className="text-muted-foreground text-xs font-medium">{reason}</Text>
                    </View>
                  ) : null}
                  {selected ? (
                    <Text className="text-primary text-base font-bold">✓</Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
