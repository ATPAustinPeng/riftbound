import { Link } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';

import { getMatchSeriesScore, useMatchHistory } from '@/lib/games';
import { useCardsIndex } from '@/lib/queries';

export default function GamesScreen() {
  const matchesQuery = useMatchHistory();
  const cardsQuery = useCardsIndex();

  const cardById = useMemo(() => {
    const names = new Map<string, string>();
    const images = new Map<string, string>();
    for (const c of cardsQuery.data?.cards ?? []) {
      names.set(c.id, c.name);
      if (c.image_url) images.set(c.id, c.image_url);
    }
    return { names, images };
  }, [cardsQuery.data?.cards]);

  const legendName = (id: string) => cardById.names.get(id) ?? 'Unknown';

  if (matchesQuery.isLoading || cardsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (matchesQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-neutral-950">
        <Text className="text-center text-red-600">Could not load matches.</Text>
        <Text className="mt-2 text-center text-xs text-neutral-500" selectable>
          {matchesQuery.error instanceof Error ? matchesQuery.error.message : String(matchesQuery.error)}
        </Text>
      </View>
    );
  }

  const matches = matchesQuery.data ?? [];

  return (
    <View className="flex-1 bg-white dark:bg-neutral-950">
      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 pb-8 pt-2"
        ListHeaderComponent={
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xs text-neutral-500">
              {matches.length} match{matches.length === 1 ? '' : 'es'}
            </Text>
            <Link href="/match/new" asChild>
              <Pressable className="rounded-lg bg-blue-600 px-4 py-2">
                <Text className="text-sm font-semibold text-white">New match</Text>
              </Pressable>
            </Link>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="mb-4 text-center text-base text-neutral-600 dark:text-neutral-400">
              No matches yet. Record your first game!
            </Text>
            <Link href="/match/new" asChild>
              <Pressable className="rounded-lg bg-blue-600 px-6 py-3">
                <Text className="font-semibold text-white">New match</Text>
              </Pressable>
            </Link>
          </View>
        }
        renderItem={({ item }) => {
          const series = getMatchSeriesScore(item.games ?? []);
          const p1 = item.players.find((p) => p.seat === 1);
          const p2 = item.players.find((p) => p.seat === 2);
          const legend1 = p1 ? legendName(p1.legend_card_id) : '?';
          const legend2 = p2 ? legendName(p2.legend_card_id) : '?';
          const scoreLabel =
            p1 && p2
              ? `${p1.display_name} ${series[1] ?? 0} – ${series[2] ?? 0} ${p2.display_name}`
              : '';

          const thumbUrl = p1 ? cardById.images.get(p1.legend_card_id) : null;

          return (
            <Link href={`/match/${item.id}`} asChild>
              <Pressable className="mb-3 flex-row gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
                {thumbUrl ? (
                  <Image source={{ uri: thumbUrl }} className="h-16 w-12" resizeMode="contain" />
                ) : (
                  <View className="h-16 w-12 items-center justify-center rounded bg-neutral-200 dark:bg-neutral-800">
                    <Text className="text-xs text-neutral-400">—</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                    {legend1} vs {legend2}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    {new Date(item.played_at).toLocaleDateString()} · {item.match_type.toUpperCase()}
                  </Text>
                  {scoreLabel ? (
                    <Text className="mt-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      {scoreLabel}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}
