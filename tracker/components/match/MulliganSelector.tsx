import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Kept' },
  { value: 1, label: 'Set aside 1' },
  { value: 2, label: 'Set aside 2' },
];

interface MulliganSelectorProps {
  label: string;
  /** Cards set aside during mulligan (0–2); null = not recorded yet. */
  value: number | null;
  onChange: (n: number) => void;
}

/** Segmented pills for the mulligan choice (draw 4, set aside up to 2). */
export function MulliganSelector({ label, value, onChange }: MulliganSelectorProps) {
  function handleSelect(next: number) {
    if (next === value) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(next);
  }

  return (
    <View className="gap-1.5">
      <Text className="text-muted-foreground text-sm font-medium">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => handleSelect(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={cn(
                'rounded-full border px-3 py-1.5',
                selected
                  ? 'border-primary bg-primary active:bg-primary/90'
                  : 'border-border bg-card active:bg-accent',
              )}>
              <Text
                className={cn(
                  'text-xs font-semibold',
                  selected ? 'text-primary-foreground' : 'text-foreground',
                )}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
