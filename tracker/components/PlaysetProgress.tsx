import { Text, View } from 'react-native';

import { PLAYSET_SIZE, playsetProgress } from '@/lib/queries';

interface PlaysetProgressProps {
  quantityOwned: number;
  compact?: boolean;
}

export function PlaysetProgress({ quantityOwned, compact = false }: PlaysetProgressProps) {
  const { owned, target, complete } = playsetProgress(quantityOwned);

  return (
    <View className={compact ? 'gap-0.5' : 'gap-1'}>
      <Text
        className={
          compact
            ? 'text-xs font-medium text-neutral-500 dark:text-neutral-400'
            : 'text-sm font-medium text-neutral-700 dark:text-neutral-300'
        }>
        Playset
      </Text>
      <View className="flex-row items-center gap-2">
        <View className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <View
            className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${(owned / PLAYSET_SIZE) * 100}%` }}
          />
        </View>
        <Text
          className={
            compact
              ? 'text-xs font-semibold text-neutral-700 dark:text-neutral-300'
              : 'text-sm font-semibold text-neutral-700 dark:text-neutral-300'
          }>
          {owned}/{target}
        </Text>
      </View>
    </View>
  );
}
