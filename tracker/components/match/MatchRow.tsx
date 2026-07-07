import { Pressable, View } from 'react-native';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import type { MatchWithLegends } from '@/lib/types';

interface MatchRowProps {
  match: MatchWithLegends;
  /** Preformatted per-game score line, e.g. "8–6, 5–8" (null while in progress). */
  games: string | null;
  onPress: () => void;
  onLongPress?: () => void;
}

function resultBadge(match: MatchWithLegends): {
  variant: NonNullable<BadgeProps['variant']>;
  label: string;
} {
  if (match.status === 'in_progress') return { variant: 'outline', label: 'Live' };
  if (match.status === 'abandoned') return { variant: 'secondary', label: 'Abandoned' };
  switch (match.result) {
    case 'win':
      return { variant: 'default', label: 'Win' };
    case 'loss':
      return { variant: 'destructive', label: 'Loss' };
    case 'draw':
      return { variant: 'secondary', label: 'Draw' };
    default:
      return { variant: 'outline', label: '—' };
  }
}

/** History-list row: matchup title, format + result badges, date, per-game scores. */
export function MatchRow({ match, games, onPress, onLongPress }: MatchRowProps) {
  const myName = match.my_legend?.name ?? match.my_deck_name ?? 'Unknown';
  const opponentName = match.opponent_legend?.name ?? match.opponent_deck_name ?? 'Unknown';
  const result = resultBadge(match);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      className="border-border bg-card active:bg-accent gap-1.5 rounded-xl border p-3">
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className="text-foreground flex-1 text-base font-semibold">
          {myName} vs {opponentName}
        </Text>
        <Text className="text-muted-foreground text-xs">
          {new Date(match.started_at).toLocaleDateString()}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Badge variant="outline">
          <Text>{match.format.toUpperCase()}</Text>
        </Badge>
        <Badge variant={result.variant}>
          <Text>{result.label}</Text>
        </Badge>
        {games ? (
          <Text numberOfLines={1} className="text-muted-foreground flex-1 text-sm">
            {games}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
