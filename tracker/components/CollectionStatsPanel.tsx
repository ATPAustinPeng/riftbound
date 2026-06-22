import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { StatCard } from '@/components/StatCard';
import { useCollectionStats } from '@/lib/queries';

interface CollectionStatsPanelProps {
  compact?: boolean;
}

export function CollectionStatsPanel({ compact = false }: CollectionStatsPanelProps) {
  const { data: stats, isLoading, isError, refetch, isRefetching } = useCollectionStats();

  if (isLoading) {
    return (
      <View className="items-center py-4">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !stats) {
    return (
      <View className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
        <Text className="text-sm text-red-700 dark:text-red-300">Could not load collection stats.</Text>
        <Pressable onPress={() => refetch()} disabled={isRefetching}>
          <Text className="mt-2 text-sm font-medium text-red-800 dark:text-red-200">
            {isRefetching ? 'Retrying…' : 'Tap to retry'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className={compact ? 'gap-3' : 'gap-4'}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
        <StatCard label="Unique owned" value={stats.unique_owned} />
        <StatCard label="Complete playsets" value={stats.complete_playsets} subtitle="3+ copies" />
        <StatCard label="For sale" value={stats.total_for_sale} subtitle="Listed extras" />
      </ScrollView>

      {!compact && stats.set_completion.length > 0 ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Set completion
          </Text>
          {stats.set_completion.map((set) => (
            <View key={set.set_id} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-neutral-700 dark:text-neutral-300">{set.set_label}</Text>
                <Text className="text-xs font-medium text-neutral-500">
                  {set.owned_count}/{set.total_count} ({set.completion_pct}%)
                </Text>
              </View>
              <View className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <View
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.min(set.completion_pct, 100)}%` }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
