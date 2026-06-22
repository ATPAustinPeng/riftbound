import { Pressable, Text, View } from 'react-native';

interface QtyStepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  compact?: boolean;
  disabled?: boolean;
}

export function QtyStepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  compact = false,
  disabled = false,
}: QtyStepperProps) {
  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && (max === undefined || value < max);

  return (
    <View className={compact ? 'gap-1' : 'gap-2'}>
      <Text
        className={
          compact
            ? 'text-xs font-medium text-neutral-500 dark:text-neutral-400'
            : 'text-sm font-medium text-neutral-700 dark:text-neutral-300'
        }>
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          disabled={!canDecrement}
          onPress={() => onChange(value - 1)}
          className={`h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900 ${!canDecrement ? 'opacity-40' : ''}`}>
          <Text className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">−</Text>
        </Pressable>
        <Text
          className={
            compact
              ? 'min-w-[24px] text-center text-sm font-semibold text-neutral-900 dark:text-white'
              : 'min-w-[32px] text-center text-base font-semibold text-neutral-900 dark:text-white'
          }>
          {value}
        </Text>
        <Pressable
          disabled={!canIncrement}
          onPress={() => onChange(value + 1)}
          className={`h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900 ${!canIncrement ? 'opacity-40' : ''}`}>
          <Text className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
