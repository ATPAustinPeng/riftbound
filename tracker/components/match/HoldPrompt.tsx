import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

interface HoldPromptProps {
  activePlayerName: string;
  /** Names of the battlefields the active player would score holds on. */
  battlefieldNames: string[];
  onScore: () => void;
  onSkip: () => void;
}

/**
 * One-tap turn-start hold confirmation: shown after Next Turn while the
 * active player controls battlefields they haven't scored from this turn and
 * hasn't resolved holds yet (`holdDecidedThisTurn`). Nothing is recorded
 * without a tap.
 */
export function HoldPrompt({
  activePlayerName,
  battlefieldNames,
  onScore,
  onSkip,
}: HoldPromptProps) {
  const points = battlefieldNames.length;

  function handle(action: () => void) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action();
  }

  return (
    <View className="gap-2 rounded-xl border border-primary bg-primary/5 px-3 py-2.5">
      <Text className="text-sm text-foreground" numberOfLines={2}>
        <Text className="text-sm font-semibold text-foreground">{activePlayerName}</Text> holds{' '}
        {battlefieldNames.join(' + ')}?
      </Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={() => handle(onScore)}
          accessibilityRole="button"
          className="min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-3 active:bg-primary/90">
          <Text className="text-sm font-semibold text-primary-foreground">
            Score +{points}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => handle(onSkip)}
          accessibilityRole="button"
          className="min-h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card px-3 active:bg-accent">
          <Text className="text-sm font-semibold text-muted-foreground">No holds</Text>
        </Pressable>
      </View>
    </View>
  );
}
