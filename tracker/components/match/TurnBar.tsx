import * as Haptics from 'expo-haptics';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { PlayerRef } from '@/lib/types';

interface TurnBarProps {
  /** 0 before the first `turn_start` event. */
  turnNumber: number;
  activePlayer: PlayerRef | null;
  /** Appends a `turn_start` event (wired by the screen). */
  onNextTurn: () => void;
}

/** "Turn N" + whose-turn chip + prominent Next Turn button. */
export function TurnBar({ turnNumber, activePlayer, onNextTurn }: TurnBarProps) {
  function handleNextTurn() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onNextTurn();
  }

  return (
    <View className="border-border bg-card flex-row items-center gap-2 rounded-xl border px-3 py-2">
      <Text className="text-foreground text-lg font-semibold">
        {turnNumber > 0 ? `Turn ${turnNumber}` : 'Not started'}
      </Text>
      {activePlayer ? (
        <Badge variant="secondary">
          <Text>{activePlayer === 'me' ? 'Me' : 'Opponent'}</Text>
        </Badge>
      ) : null}
      <View className="flex-1" />
      <Button onPress={handleNextTurn}>
        <Text>Next Turn</Text>
      </Button>
    </View>
  );
}
