import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';

import { LegendPicker } from '@/components/match';
import { useAuth } from '@/lib/auth-context';
import { abandonMatch, startMatch, useMatchStore } from '@/lib/match-store';
import { syncNow } from '@/lib/match-sync';
import { getLegendOptions, useCardsIndex } from '@/lib/queries';
import type { Card, MatchFormat, PlayerRef } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

/** Alert.alert is a no-op on react-native-web; fall back to window.confirm. */
function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/** Segmented pill row (format / starting player), CollectionGoalSelector-style. */
function PillRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-muted-foreground">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={cn(
                'rounded-full border px-4 py-2',
                selected
                  ? 'border-primary bg-primary active:bg-primary/90'
                  : 'border-border bg-card active:bg-accent',
              )}>
              <Text
                className={cn(
                  'text-sm font-semibold',
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

export default function NewMatchScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const cardsQuery = useCardsIndex();
  const { isHydrated, state: activeMatch } = useMatchStore();

  const [myLegend, setMyLegend] = useState<Card | null>(null);
  const [opponentLegend, setOpponentLegend] = useState<Card | null>(null);
  const [myDeckName, setMyDeckName] = useState('');
  const [opponentDeckName, setOpponentDeckName] = useState('');
  const [format, setFormat] = useState<MatchFormat | null>(null);
  const [startingPlayer, setStartingPlayer] = useState<PlayerRef | 'later'>('later');

  const legendOptions = useMemo(
    () => getLegendOptions(cardsQuery.data?.cards ?? []),
    [cardsQuery.data],
  );

  function beginMatch(userId: string, chosenFormat: MatchFormat) {
    const match = startMatch({
      userId,
      format: chosenFormat,
      gameMode: '1v1',
      myLegendCardId: myLegend?.id ?? null,
      opponentLegendCardId: opponentLegend?.id ?? null,
      myDeckName: myDeckName.trim() || null,
      opponentDeckName: opponentDeckName.trim() || null,
      startingPlayer: startingPlayer === 'later' ? null : startingPlayer,
    });
    router.replace(`/match/${match.id}`);
  }

  function handleStart() {
    if (!user?.id || !format || !isHydrated) return;
    const userId = user.id;
    const chosenFormat = format;

    if (!activeMatch) {
      beginMatch(userId, chosenFormat);
      return;
    }

    // Never replace an existing active match silently.
    confirmAction(
      'Unfinished match',
      'You have an unfinished match — abandon it and start a new one?',
      'Abandon & start',
      () => {
        void (async () => {
          if (activeMatch.match.status === 'in_progress') abandonMatch();
          try {
            await syncNow(); // best-effort flush of the old match first
          } catch {
            // syncNow never throws; belt and braces.
          }
          beginMatch(userId, chosenFormat);
        })();
      },
    );
  }

  if (cardsQuery.isLoading) {
    return (
      <View className="flex-1 gap-4 bg-background px-4 pt-4">
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-14 w-full rounded-md" />
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <Skeleton className="h-10 w-2/3 rounded-full" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pb-12 pt-4"
      keyboardShouldPersistTaps="handled">
      {activeMatch ? (
        <View className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <Text className="text-sm text-destructive">
            A match is already in progress — starting a new one abandons it.
          </Text>
        </View>
      ) : null}

      <LegendPicker
        label="My Legend"
        cards={legendOptions}
        selectedCard={myLegend}
        onSelect={setMyLegend}
      />
      <LegendPicker
        label="Opponent Legend"
        cards={legendOptions}
        selectedCard={opponentLegend}
        onSelect={setOpponentLegend}
        placeholder="Unknown"
      />

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-muted-foreground">My deck name (optional)</Text>
        <Input
          value={myDeckName}
          onChangeText={setMyDeckName}
          placeholder="e.g. Viktor Control"
          autoCorrect={false}
        />
      </View>
      <View className="gap-1.5">
        <Text className="text-sm font-medium text-muted-foreground">
          Opponent deck name (optional)
        </Text>
        <Input
          value={opponentDeckName}
          onChangeText={setOpponentDeckName}
          placeholder="e.g. Jinx Aggro"
          autoCorrect={false}
        />
      </View>

      <PillRow<MatchFormat>
        label="Format"
        options={[
          { value: 'bo1', label: 'Best of 1' },
          { value: 'bo3', label: 'Best of 3' },
        ]}
        value={format}
        onChange={setFormat}
      />

      <PillRow<PlayerRef | 'later'>
        label="Starting player"
        options={[
          { value: 'me', label: 'Me' },
          { value: 'opponent', label: 'Opponent' },
          { value: 'later', label: 'Decide later' },
        ]}
        value={startingPlayer}
        onChange={setStartingPlayer}
      />

      <Button size="lg" disabled={!format || !user?.id || !isHydrated} onPress={handleStart}>
        <Text>Start Match</Text>
      </Button>
    </ScrollView>
  );
}
