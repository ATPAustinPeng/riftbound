import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { PlayerRef } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ScoreBoardProps {
  myScore: number;
  opponentScore: number;
  /** Per-game win target (`match_games.target_score`) — never hardcode 8. */
  targetScore: number;
  /** Defaults to "Me" (e.g. pass the legend name). */
  myName?: string;
  /** Defaults to "Opponent". */
  opponentName?: string;
  /** When set, each panel shows a one-tap "+1 Effect" button. */
  onEffect?: (player: PlayerRef) => void;
  /** Long-press on "+1 Effect": open the multi-point stepper. */
  onEffectLongPress?: (player: PlayerRef) => void;
}

function ScorePanel({
  name,
  score,
  atTarget,
  onEffect,
  onEffectLongPress,
}: {
  name: string;
  score: number;
  atTarget: boolean;
  onEffect?: () => void;
  onEffectLongPress?: () => void;
}) {
  function handleEffect() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onEffect?.();
  }

  return (
    <View
      className={cn(
        'flex-1 items-center gap-1 rounded-xl border p-4',
        atTarget ? 'border-primary bg-primary/10' : 'border-border bg-card',
      )}>
      <Text numberOfLines={1} className="text-muted-foreground text-sm font-medium">
        {name}
      </Text>
      <Text className={cn('text-6xl font-bold', atTarget ? 'text-primary' : 'text-foreground')}>
        {score}
      </Text>
      {onEffect ? (
        <Pressable
          onPress={handleEffect}
          onLongPress={onEffectLongPress}
          accessibilityRole="button"
          accessibilityLabel={`${name}: +1 point from effect. Long-press for more points.`}
          className="border-border bg-background active:bg-accent min-h-9 items-center justify-center rounded-full border px-4">
          <Text className="text-foreground text-sm font-semibold">+1 Effect</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Two large side-by-side score panels; a panel at/above target is highlighted. */
export function ScoreBoard({
  myScore,
  opponentScore,
  targetScore,
  myName = 'Me',
  opponentName = 'Opponent',
  onEffect,
  onEffectLongPress,
}: ScoreBoardProps) {
  return (
    <View className="gap-2">
      <View className="flex-row gap-3">
        <ScorePanel
          name={myName}
          score={myScore}
          atTarget={myScore >= targetScore}
          onEffect={onEffect ? () => onEffect('me') : undefined}
          onEffectLongPress={onEffectLongPress ? () => onEffectLongPress('me') : undefined}
        />
        <ScorePanel
          name={opponentName}
          score={opponentScore}
          atTarget={opponentScore >= targetScore}
          onEffect={onEffect ? () => onEffect('opponent') : undefined}
          onEffectLongPress={onEffectLongPress ? () => onEffectLongPress('opponent') : undefined}
        />
      </View>
      <Text className="text-muted-foreground text-center text-xs">
        First to {targetScore}
      </Text>
    </View>
  );
}
