import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PlaysetProgress } from '@/components/PlaysetProgress';
import { QtyStepper } from '@/components/QtyStepper';
import { WishlistToggle } from '@/components/WishlistToggle';
import {
  canBeFoil,
  getForSaleCount,
  getOwnedFoilQuantity,
  getOwnedQuantity,
  isWishlisted,
  useCard,
  useCollectionGoal,
  useToggleWishlistMutation,
  useUpsertUserCardMutation,
  useUserCardsMap,
  useWishlistMap,
} from '@/lib/queries';

function StatRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View className="flex-row justify-between border-b border-neutral-100 py-2 dark:border-neutral-800">
      <Text className="text-sm text-neutral-500">{label}</Text>
      <Text className="text-sm font-medium text-neutral-900 dark:text-white">{value}</Text>
    </View>
  );
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const cardQuery = useCard(id);
  const userCardsQuery = useUserCardsMap();
  const wishlistQuery = useWishlistMap();
  const upsertUserCard = useUpsertUserCardMutation();
  const toggleWishlist = useToggleWishlistMutation();
  const { goal } = useCollectionGoal();

  const card = cardQuery.data;
  const owned = getOwnedQuantity(userCardsQuery.data, id ?? '');
  const foilOwned = getOwnedFoilQuantity(userCardsQuery.data, id ?? '');
  const forSale = getForSaleCount(userCardsQuery.data, id ?? '');
  const wishlisted = isWishlisted(wishlistQuery.data, id ?? '');
  const notes = userCardsQuery.data?.[id ?? '']?.notes ?? '';
  const cardCanFoil = card ? canBeFoil(card) : false;
  const combinedOwned = owned + foilOwned;

  const [notesDraft, setNotesDraft] = useState(notes);

  useEffect(() => {
    setNotesDraft(notes);
  }, [notes]);

  useEffect(() => {
    if (card?.name) {
      navigation.setOptions({ title: card.name });
    }
  }, [card?.name, navigation]);

  if (cardQuery.isLoading || userCardsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (cardQuery.isError || !card) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-neutral-950">
        <Text className="mb-4 text-center text-base text-neutral-600 dark:text-neutral-400">
          Card not found.
        </Text>
        <Link href="/(tabs)" asChild>
          <Pressable className="rounded-lg bg-blue-600 px-4 py-2">
            <Text className="font-semibold text-white">Back to Browse</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  function saveNotes() {
    if (!id || notesDraft === notes) return;
    upsertUserCard.mutate({ cardId: id, notes: notesDraft.trim() || null });
  }

  const domains = card.domains?.map((d) => d.domain_label ?? d.domain_id).join(', ');
  const tags = card.tags?.map((t) => t.tag).join(', ');

  return (
    <ScrollView className="flex-1 bg-white dark:bg-neutral-950" contentContainerClassName="pb-10">
      <View className="items-center bg-neutral-100 px-4 py-6 dark:bg-neutral-900">
        {card.image_url ? (
          <Image
            source={{ uri: card.image_url }}
            accessibilityLabel={card.image_alt ?? card.name}
            className="aspect-[5/7] w-full max-w-sm"
            resizeMode="contain"
          />
        ) : (
          <View className="aspect-[5/7] w-full max-w-sm items-center justify-center rounded-lg bg-neutral-200 dark:bg-neutral-800">
            <Text className="text-neutral-500">No image</Text>
          </View>
        )}
      </View>

      <View className="gap-6 px-4 pt-4">
        <View>
          <Text className="text-2xl font-bold text-neutral-900 dark:text-white">{card.name}</Text>
          <Text className="mt-1 text-sm text-neutral-500">
            {card.set_name ?? card.set_id}
            {card.collector_number != null ? ` · #${card.collector_number}` : ''}
            {card.public_code ? ` · ${card.public_code}` : ''}
          </Text>
        </View>

        <View className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <Text className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">Stats</Text>
          <StatRow label="Type" value={card.card_type} />
          <StatRow label="Super type" value={card.super_type} />
          <StatRow label="Rarity" value={card.rarity_label} />
          <StatRow label="Energy" value={card.energy} />
          <StatRow label="Might" value={card.might} />
          <StatRow label="Power" value={card.power} />
          <StatRow label="Might bonus" value={card.might_bonus} />
          <StatRow label="Orientation" value={card.orientation} />
          <StatRow label="Domains" value={domains} />
          <StatRow label="Tags" value={tags} />
          <StatRow label="Illustrator" value={card.illustrator} />
        </View>

        {card.ability_text ? (
          <View className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <Text className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Ability
            </Text>
            <Text className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
              {card.ability_text}
            </Text>
          </View>
        ) : null}

        <View className="gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <Text className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Your collection
          </Text>
          <PlaysetProgress
            goal={goal}
            owned={owned}
            foil={foilOwned}
            canFoil={cardCanFoil}
            cardType={card.card_type}
          />
          {cardCanFoil && combinedOwned > 0 ? (
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">
              {owned} normal{owned === 1 ? '' : 's'}
              {foilOwned > 0 ? ` + ${foilOwned} foil` : ''}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-6">
            <QtyStepper
              label="Owned"
              value={owned}
              onChange={(next) => id && upsertUserCard.mutate({ cardId: id, quantity_owned: next })}
            />
            {cardCanFoil ? (
              <QtyStepper
                label="Owned (foil)"
                value={foilOwned}
                onChange={(next) =>
                  id && upsertUserCard.mutate({ cardId: id, quantity_owned_foil: next })
                }
              />
            ) : null}
            <QtyStepper
              label="For sale"
              value={forSale}
              onChange={(next) => id && upsertUserCard.mutate({ cardId: id, for_sale_count: next })}
            />
          </View>
          <WishlistToggle
            isWishlisted={wishlisted}
            disabled={toggleWishlist.isPending}
            onToggle={() => id && toggleWishlist.mutate({ cardId: id, add: !wishlisted })}
          />
          <View className="gap-2">
            <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Notes</Text>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              onBlur={saveNotes}
              placeholder="Add notes about this copy…"
              placeholderTextColor="#9ca3af"
              multiline
              className="min-h-[80px] rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
