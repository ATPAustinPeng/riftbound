import { Link } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, View } from 'react-native';

import {
  buildWishlistWithCards,
  useCardsIndex,
  useMarkOwnedFromWishlistMutation,
  useToggleWishlistMutation,
  useWishlistMap,
} from '@/lib/queries';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

function WishlistRowSkeleton() {
  return (
    <View className="mb-3 flex-row gap-3 rounded-xl border border-border bg-card p-3">
      <Skeleton className="h-24 w-[68px]" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <View className="flex-row gap-2">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-md" />
        </View>
      </View>
    </View>
  );
}

export default function WishlistScreen() {
  const cardsQuery = useCardsIndex();
  const wishlistQuery = useWishlistMap();
  const toggleWishlist = useToggleWishlistMutation();
  const markOwned = useMarkOwnedFromWishlistMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const items = useMemo(() => {
    if (!cardsQuery.data || !wishlistQuery.data) return [];
    return buildWishlistWithCards(wishlistQuery.data, cardsQuery.data.cards);
  }, [cardsQuery.data, wishlistQuery.data]);

  const isRefetching = cardsQuery.isRefetching || wishlistQuery.isRefetching;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([cardsQuery.refetch(), wishlistQuery.refetch()]);
    setIsRefreshing(false);
  }, [cardsQuery, wishlistQuery]);

  if (cardsQuery.isLoading || wishlistQuery.isLoading) {
    return (
      <View className="flex-1 bg-background px-4 pb-8 pt-2">
        <Skeleton className="mb-3 h-3 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <WishlistRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (cardsQuery.isError || wishlistQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-destructive">Could not load wishlist.</Text>
        <Button onPress={() => void handleRefresh()} disabled={isRefetching} variant="outline">
          <Text>{isRefetching ? 'Retrying…' : 'Tap to retry'}</Text>
        </Button>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={items}
      keyExtractor={(item) => item.card_id}
      contentContainerClassName="px-4 pb-8 pt-2"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      ListHeaderComponent={
        <Text variant="small" className="mb-3 text-muted-foreground">
          {items.length} card{items.length === 1 ? '' : 's'} on your wishlist
        </Text>
      }
      ListEmptyComponent={
        <View className="items-center py-12">
          <Text variant="muted" className="text-center text-base">
            Your wishlist is empty. Tap ♡ on any card to add it here.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-3 flex-row gap-3 rounded-xl border border-border bg-card p-3">
          <Link href={`/card/${item.card.id}`} asChild>
            <Pressable className="overflow-hidden rounded-md active:opacity-70">
              {item.card.image_url ? (
                <Image
                  source={{ uri: item.card.image_url }}
                  className="h-24 w-[68px]"
                  resizeMode="contain"
                />
              ) : (
                <View className="h-24 w-[68px] items-center justify-center bg-muted">
                  <Text variant="muted" className="text-xs">—</Text>
                </View>
              )}
            </Pressable>
          </Link>

          <View className="flex-1 gap-2">
            <Link href={`/card/${item.card.id}`} asChild>
              <Pressable className="active:opacity-70">
                <Text className="text-base font-semibold text-foreground" numberOfLines={2}>
                  {item.card.name}
                </Text>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Text variant="small" className="text-muted-foreground">
                    {item.card.set_name ?? item.card.set_id}
                  </Text>
                  {item.card.rarity_label ? (
                    <Badge variant="secondary">
                      <Text className="text-xs">{item.card.rarity_label}</Text>
                    </Badge>
                  ) : null}
                </View>
              </Pressable>
            </Link>

            <View className="flex-row flex-wrap gap-2">
              <Pressable
                disabled={markOwned.isPending}
                onPress={() => markOwned.mutate({ cardId: item.card_id, quantity: 1 })}
                className="rounded-md bg-primary px-3 py-1.5 active:opacity-80">
                <Text className="text-xs font-semibold text-primary-foreground">Mark owned</Text>
              </Pressable>
              <Pressable
                disabled={toggleWishlist.isPending}
                onPress={() => toggleWishlist.mutate({ cardId: item.card_id, add: false })}
                className="rounded-md border border-border px-3 py-1.5 active:opacity-70">
                <Text className="text-xs font-semibold text-foreground">Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    />
  );
}
