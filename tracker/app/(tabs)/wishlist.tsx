import { Link } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';

import {
  buildWishlistWithCards,
  useCardsIndex,
  useMarkOwnedFromWishlistMutation,
  useToggleWishlistMutation,
  useWishlistMap,
} from '@/lib/queries';

export default function WishlistScreen() {
  const cardsQuery = useCardsIndex();
  const wishlistQuery = useWishlistMap();
  const toggleWishlist = useToggleWishlistMutation();
  const markOwned = useMarkOwnedFromWishlistMutation();

  const items = useMemo(() => {
    if (!cardsQuery.data || !wishlistQuery.data) return [];
    return buildWishlistWithCards(wishlistQuery.data, cardsQuery.data.cards);
  }, [cardsQuery.data, wishlistQuery.data]);

  if (cardsQuery.isLoading || wishlistQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (cardsQuery.isError || wishlistQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-neutral-950">
        <Text className="text-center text-red-600 dark:text-red-400">Could not load wishlist.</Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-white dark:bg-neutral-950"
      data={items}
      keyExtractor={(item) => item.card_id}
      contentContainerClassName="px-4 pb-8 pt-2"
      ListHeaderComponent={
        <Text className="mb-3 text-xs text-neutral-500">
          {items.length} card{items.length === 1 ? '' : 's'} on your wishlist
        </Text>
      }
      ListEmptyComponent={
        <View className="items-center py-12">
          <Text className="text-center text-base text-neutral-600 dark:text-neutral-400">
            Your wishlist is empty. Tap ♡ on any card to add it here.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-3 flex-row gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <Link href={`/card/${item.card.id}`} asChild>
            <Pressable className="overflow-hidden rounded-md">
              {item.card.image_url ? (
                <Image
                  source={{ uri: item.card.image_url }}
                  className="h-24 w-[68px]"
                  resizeMode="contain"
                />
              ) : (
                <View className="h-24 w-[68px] items-center justify-center bg-neutral-200 dark:bg-neutral-800">
                  <Text className="text-xs text-neutral-400">—</Text>
                </View>
              )}
            </Pressable>
          </Link>

          <View className="flex-1 gap-2">
            <Link href={`/card/${item.card.id}`} asChild>
              <Pressable>
                <Text className="text-base font-semibold text-neutral-900 dark:text-white" numberOfLines={2}>
                  {item.card.name}
                </Text>
                <Text className="text-xs text-neutral-500">{item.card.set_name ?? item.card.set_id}</Text>
              </Pressable>
            </Link>

            <View className="flex-row flex-wrap gap-2">
              <Pressable
                disabled={markOwned.isPending}
                onPress={() => markOwned.mutate({ cardId: item.card_id, quantity: 1 })}
                className="rounded-md bg-blue-600 px-3 py-1.5">
                <Text className="text-xs font-semibold text-white">Mark owned</Text>
              </Pressable>
              <Pressable
                disabled={toggleWishlist.isPending}
                onPress={() => toggleWishlist.mutate({ cardId: item.card_id, add: false })}
                className="rounded-md border border-neutral-300 px-3 py-1.5 dark:border-neutral-700">
                <Text className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    />
  );
}
