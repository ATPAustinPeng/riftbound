import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';

import { COLLECTION_GOALS, useCollectionGoal, type CollectionGoal } from '@/lib/queries';

interface CollectionGoalSelectorProps {
  compact?: boolean;
}

export function CollectionGoalSelector({ compact = false }: CollectionGoalSelectorProps) {
  const { goal, setGoal } = useCollectionGoal();

  function handleSelect(next: CollectionGoal) {
    if (next === goal) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setGoal(next).catch((error) => {
      console.warn('Failed to update collection goal:', error);
    });
  }

  if (compact) {
    return (
      <View className="px-4 pb-2">
        <View className="flex-row flex-wrap gap-2">
          {COLLECTION_GOALS.map((option) => {
            const selected = option.id === goal;
            return (
              <Pressable
                key={option.id}
                onPress={() => handleSelect(option.id)}
                className={`rounded-full border px-3 py-1.5 ${
                  selected
                    ? 'border-blue-600 bg-blue-600 active:bg-blue-700'
                    : 'border-neutral-300 bg-white active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:active:bg-neutral-800'
                }`}>
                <Text
                  className={`text-xs font-semibold ${
                    selected ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
                  }`}>
                  {option.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {COLLECTION_GOALS.map((option) => {
        const selected = option.id === goal;
        return (
          <Pressable
            key={option.id}
            onPress={() => handleSelect(option.id)}
            className={`rounded-xl border p-3 ${
              selected
                ? 'border-blue-600 bg-blue-50 active:bg-blue-100 dark:border-blue-500 dark:bg-blue-950 dark:active:bg-blue-900'
                : 'border-neutral-200 bg-neutral-50 active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:active:bg-neutral-800'
            }`}>
            <Text
              className={`text-sm font-semibold ${
                selected ? 'text-blue-700 dark:text-blue-300' : 'text-neutral-900 dark:text-white'
              }`}>
              {option.shortLabel}
            </Text>
            <Text className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {option.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
