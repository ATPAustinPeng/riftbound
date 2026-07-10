import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';

import { COLLECTION_GOALS, useCollectionGoal, type CollectionGoal } from '@/lib/queries';

interface CollectionGoalSelectorProps {
  compact?: boolean;
}

function Chip({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${disabled ? 'opacity-40' : ''} ${
        selected
          ? 'border-blue-600 bg-blue-600 active:bg-blue-700'
          : 'border-neutral-300 bg-white active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:active:bg-neutral-800'
      }`}>
      <Text
        className={`text-xs font-semibold ${
          selected ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CollectionGoalSelector({ compact = false }: CollectionGoalSelectorProps) {
  const { goal, setGoal } = useCollectionGoal();
  const isMaster = goal === 'master';
  const finish = goal === 'playset_nonfoil' ? 'nonfoil' : 'all';

  function handleSelect(next: CollectionGoal) {
    if (next === goal) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void setGoal(next).catch((error) => {
      console.warn('Failed to update collection goal:', error);
    });
  }

  const current = COLLECTION_GOALS.find((option) => option.id === goal);

  return (
    <View className={compact ? 'gap-2 px-4 pb-2' : 'gap-2'}>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Goal</Text>
        <Chip label="Master Set" selected={isMaster} onPress={() => handleSelect('master')} />
        <Chip
          label="Playset"
          selected={!isMaster}
          onPress={() => handleSelect(finish === 'nonfoil' ? 'playset_nonfoil' : 'playset_all')}
        />
        <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Finish</Text>
        <Chip
          label="Nonfoil"
          selected={!isMaster && finish === 'nonfoil'}
          disabled={isMaster}
          onPress={() => handleSelect('playset_nonfoil')}
        />
        <Chip
          label="All finishes"
          selected={!isMaster && finish === 'all'}
          disabled={isMaster}
          onPress={() => handleSelect('playset_all')}
        />
      </View>
      {isMaster ? (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          Master Set includes all finishes.
        </Text>
      ) : null}
      {!compact && current ? (
        <Text className="text-sm text-neutral-600 dark:text-neutral-400">
          {current.description}
        </Text>
      ) : null}
    </View>
  );
}
