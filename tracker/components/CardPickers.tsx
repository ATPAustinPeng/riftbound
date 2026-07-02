import { useMemo, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { Image, Pressable, Text, TextInput, View } from 'react-native';

import { useCardsIndex } from '@/lib/queries';
import type { Card } from '@/lib/types';

function collectorSortKey(card: Card): number {
  if (card.collector_number == null) return Number.POSITIVE_INFINITY;
  const n = Number.parseInt(String(card.collector_number), 10);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function dedupeCardsByName(cards: Card[]): Card[] {
  const byName = new Map<string, Card>();

  for (const card of cards) {
    const existing = byName.get(card.name);
    if (!existing || collectorSortKey(card) < collectorSortKey(existing)) {
      byName.set(card.name, card);
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function PickerTile({
  card,
  selected,
  onPress,
}: {
  card: Card;
  selected: boolean;
  onPress: () => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      className={`overflow-hidden rounded-lg border-2 p-1 ${
        selected
          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
          : 'border-transparent bg-white dark:bg-neutral-900'
      }`}>
      <View className="aspect-[5/7] w-full rounded-md bg-neutral-100 dark:bg-neutral-800">
        {card.image_url && !failed ? (
          <Image
            source={{ uri: card.image_url }}
            accessibilityLabel={card.image_alt ?? card.name}
            className="h-full w-full"
            resizeMode="contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <View className="flex-1 items-center justify-center p-1">
            <Text
              className="text-center text-[10px] font-medium text-neutral-500"
              numberOfLines={3}>
              {card.name}
            </Text>
          </View>
        )}
      </View>
      <Text className="mt-1 text-center text-[10px] font-medium text-neutral-700 dark:text-neutral-300" numberOfLines={2}>
        {card.name}
      </Text>
    </Pressable>
  );
}

interface CardTypePickerProps {
  cardType: 'Legend' | 'Battlefield';
  selectedId: string | null;
  onSelect: (cardId: string) => void;
  label: string;
}

function CardTypePicker({ cardType, selectedId, onSelect, label }: CardTypePickerProps) {
  const cardsQuery = useCardsIndex();
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    if (!cardsQuery.data) return [];
    const filtered = cardsQuery.data.cards.filter((c) => c.card_type === cardType);
    const deduped = dedupeCardsByName(filtered);
    const q = search.trim().toLowerCase();
    if (!q) return deduped;
    return deduped.filter((c) => c.name.toLowerCase().includes(q));
  }, [cardsQuery.data, cardType, search]);

  if (cardsQuery.isLoading) {
    return <Text className="text-sm text-neutral-500">Loading {label.toLowerCase()}…</Text>;
  }

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-neutral-900 dark:text-white">{label}</Text>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={`Search ${label.toLowerCase()}…`}
        placeholderTextColor="#9ca3af"
        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
      />
      <View style={{ height: 280 }}>
        <FlashList
          data={options}
          numColumns={3}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View className="flex-1 p-1">
              <PickerTile
                card={item}
                selected={selectedId === item.id}
                onPress={() => onSelect(item.id)}
              />
            </View>
          )}
        />
      </View>
    </View>
  );
}

export function LegendPicker(props: Omit<CardTypePickerProps, 'cardType' | 'label'> & { label?: string }) {
  return <CardTypePicker cardType="Legend" label={props.label ?? 'Legend'} {...props} />;
}

export function BattlefieldPicker(
  props: Omit<CardTypePickerProps, 'cardType' | 'label'> & { label?: string },
) {
  return <CardTypePicker cardType="Battlefield" label={props.label ?? 'Battlefield'} {...props} />;
}

export function getCardById(cards: Card[], id: string | null): Card | null {
  if (!id) return null;
  return cards.find((c) => c.id === id) ?? null;
}
