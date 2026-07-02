import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { ShareMatchModal } from '@/components/ShareMatchModal';
import { useAuth } from '@/lib/auth-context';
import {
  bufferedEventsToGameEvents,
  clearGameBuffer,
  gameEventsToBuffered,
  loadGameBuffer,
  saveGameBuffer,
  type BufferedScoreEvent,
} from '@/lib/game-event-buffer';
import {
  deriveScore,
  getActiveGame,
  getMatchSeriesScore,
  isMatchOwner,
  useEndGameMutation,
  useFlushGameEventsMutation,
  useMatch,
  useStartNextGameMutation,
} from '@/lib/games';
import { useCardsIndex } from '@/lib/queries';

export default function RecordMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const matchQuery = useMatch(id);
  const cardsQuery = useCardsIndex();
  const flushEvents = useFlushGameEventsMutation();
  const endGame = useEndGameMutation();
  const startNextGame = useStartNextGameMutation();

  const [localEvents, setLocalEvents] = useState<BufferedScoreEvent[]>([]);
  const [turnNo, setTurnNo] = useState(1);
  const [bufferHydrated, setBufferHydrated] = useState(false);
  const [shareSeat, setShareSeat] = useState<number | null>(null);

  const localEventsRef = useRef(localEvents);
  localEventsRef.current = localEvents;

  const match = matchQuery.data;
  const activeGame = match ? getActiveGame(match) : null;
  const events = useMemo(
    () => (activeGame ? bufferedEventsToGameEvents(activeGame.id, localEvents) : []),
    [activeGame, localEvents],
  );
  const score = useMemo(() => deriveScore(events), [events]);
  const pointTarget = activeGame?.point_target ?? match?.point_target ?? 8;

  const cardName = useCallback(
    (cardId: string) => cardsQuery.data?.cards.find((c) => c.id === cardId)?.name ?? cardId,
    [cardsQuery.data?.cards],
  );

  const playerBySeat = useMemo(() => {
    const map = new Map<number, NonNullable<typeof match>['players'][number]>();
    for (const p of match?.players ?? []) map.set(p.seat, p);
    return map;
  }, [match?.players]);

  const owner = match ? isMatchOwner(match, user?.id) : false;

  useEffect(() => {
    if (!activeGame) return;

    let cancelled = false;
    setLocalEvents([]);
    setTurnNo(1);
    setBufferHydrated(false);

    void (async () => {
      const buffer = await loadGameBuffer(activeGame.id);
      if (cancelled) return;

      if (buffer) {
        setLocalEvents(buffer.events);
        setTurnNo(buffer.turnNo);
      } else {
        setLocalEvents(gameEventsToBuffered(activeGame.events));
        setTurnNo(Math.max(1, ...activeGame.events.map((e) => e.turn_no), 1));
      }
      setBufferHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeGame?.id]);

  useEffect(() => {
    if (!activeGame || !bufferHydrated) return;
    void saveGameBuffer({ gameId: activeGame.id, turnNo, events: localEvents });
  }, [activeGame?.id, turnNo, localEvents, bufferHydrated]);

  const flushBufferedEvents = useCallback(
    async (gameId: string, matchId: string, eventsToFlush: BufferedScoreEvent[]) => {
      if (eventsToFlush.length === 0) {
        await clearGameBuffer(gameId);
        return;
      }

      await flushEvents.mutateAsync({ gameId, matchId, events: eventsToFlush });
      await clearGameBuffer(gameId);
    },
    [flushEvents],
  );

  useEffect(() => {
    if (!match || !activeGame || !owner) return;

    const gameId = activeGame.id;
    const matchId = match.id;

    return () => {
      void flushBufferedEvents(gameId, matchId, localEventsRef.current);
    };
  }, [match?.id, activeGame?.id, owner, flushBufferedEvents]);

  useEffect(() => {
    if (!match || !activeGame || !owner) return;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void flushBufferedEvents(activeGame.id, match.id, localEventsRef.current);
      }
    });

    return () => sub.remove();
  }, [match?.id, activeGame?.id, owner, flushBufferedEvents]);

  const handleEndGame = useCallback(
    async (winnerSeat: number) => {
      if (!match || !activeGame) return;

      try {
        await flushBufferedEvents(activeGame.id, match.id, localEventsRef.current);

        await endGame.mutateAsync({
          gameId: activeGame.id,
          matchId: match.id,
          winnerSeat,
        });

        const seriesWins = getMatchSeriesScore(
          match.games.map((g) =>
            g.id === activeGame.id ? { ...g, winner_seat: winnerSeat } : g,
          ),
        );
        const winsNeeded = match.match_type === 'bo3' ? 2 : 1;
        const winnerWins = seriesWins[winnerSeat] ?? 0;

        if (winnerWins >= winsNeeded) {
          Alert.alert('Match complete', 'The match is finished.', [
            { text: 'View summary', onPress: () => router.replace(`/match/${match.id}`) },
          ]);
          return;
        }

        if (match.match_type === 'bo3') {
          const nextFirst = activeGame.first_player_seat === 1 ? 2 : 1;
          const bfs = activeGame.battlefields;
          Alert.alert('Game complete', 'Start the next game?', [
            { text: 'Later', onPress: () => router.replace(`/match/${match.id}`) },
            {
              text: 'Next game',
              onPress: async () => {
                try {
                  await startNextGame.mutateAsync({
                    matchId: match.id,
                    gameNo: activeGame.game_no + 1,
                    firstPlayerSeat: nextFirst,
                    pointTarget,
                    battlefields: [bfs[0]?.card_id ?? '', bfs[1]?.card_id ?? ''] as [
                      string,
                      string,
                    ],
                  });
                  setLocalEvents([]);
                  setTurnNo(1);
                } catch (err) {
                  Alert.alert(
                    'Error',
                    err instanceof Error ? err.message : 'Could not start next game',
                  );
                }
              },
            },
          ]);
        } else {
          router.replace(`/match/${match.id}`);
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Could not end game');
      }
    },
    [
      match,
      activeGame,
      endGame,
      pointTarget,
      router,
      startNextGame,
      flushBufferedEvents,
    ],
  );

  const checkWin = useCallback(
    (nextScore: ReturnType<typeof deriveScore>) => {
      for (const [seatStr, pts] of Object.entries(nextScore.bySeat)) {
        const seat = Number(seatStr);
        if (pts >= pointTarget) {
          const player = playerBySeat.get(seat);
          Alert.alert(
            'Game point',
            `${player?.display_name ?? `Player ${seat}`} reached ${pointTarget} points!`,
            [
              { text: 'Keep playing', style: 'cancel' },
              {
                text: 'End game',
                onPress: () => void handleEndGame(seat),
              },
            ],
          );
          return;
        }
      }
    },
    [pointTarget, playerBySeat, handleEndGame],
  );

  const handleScore = (
    scorerSeat: number,
    opts?: { battlefieldPosition?: number; source?: 'battlefield' | 'effect' },
  ) => {
    if (!match || !activeGame || !owner) return;

    const nextSeq =
      localEvents.length > 0 ? Math.max(...localEvents.map((e) => e.seq)) + 1 : 1;

    const newEvent: BufferedScoreEvent = {
      seq: nextSeq,
      turn_no: turnNo,
      event_type: 'score',
      payload: {
        scorer_seat: scorerSeat,
        points: 1,
        source: opts?.source ?? (opts?.battlefieldPosition != null ? 'battlefield' : 'effect'),
        ...(opts?.battlefieldPosition != null
          ? { battlefield_position: opts.battlefieldPosition }
          : {}),
      },
    };

    const nextEvents = [...localEvents, newEvent];
    setLocalEvents(nextEvents);
    checkWin(deriveScore(bufferedEventsToGameEvents(activeGame.id, nextEvents)));
  };

  const handleUndo = () => {
    if (localEvents.length === 0) return;
    const lastSeq = Math.max(...localEvents.map((e) => e.seq));
    setLocalEvents((prev) => prev.filter((e) => e.seq !== lastSeq));
  };

  if (matchQuery.isLoading || (activeGame && !bufferHydrated)) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!match || !activeGame) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-neutral-950">
        <Text className="mb-4 text-center text-neutral-600 dark:text-neutral-400">
          {match && !activeGame ? 'This match is complete.' : 'Match not found.'}
        </Text>
        {match ? (
          <Link href={`/match/${match.id}`} asChild>
            <Pressable className="rounded-lg bg-blue-600 px-4 py-2">
              <Text className="font-semibold text-white">View summary</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    );
  }

  const p1 = playerBySeat.get(1);
  const p2 = playerBySeat.get(2);
  const bf1 = activeGame.battlefields.find((b) => b.position === 1);
  const bf2 = activeGame.battlefields.find((b) => b.position === 2);
  const isBusy = flushEvents.isPending || endGame.isPending || startNextGame.isPending;

  return (
    <ScrollView className="flex-1 bg-white dark:bg-neutral-950" contentContainerClassName="px-4 pb-10 pt-2">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-xl font-bold text-neutral-900 dark:text-white">
          Game {activeGame.game_no}
        </Text>
        <View className="flex-row gap-2">
          <Link href={`/match/${match.id}`} asChild>
            <Pressable className="rounded-lg border border-neutral-300 px-3 py-1.5 dark:border-neutral-600">
              <Text className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Summary</Text>
            </Pressable>
          </Link>
          {owner ? (
            <Pressable
              onPress={() => setShareSeat(1)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 dark:border-neutral-600">
              <Text className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Share</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!owner ? (
        <Text className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          View-only — only the match owner can record scores.
        </Text>
      ) : null}

      <View className="mb-6 flex-row justify-around rounded-xl bg-neutral-100 p-4 dark:bg-neutral-900">
        {[1, 2].map((seat) => {
          const player = playerBySeat.get(seat);
          return (
            <View key={seat} className="items-center">
              <Text className="text-sm text-neutral-500">{player?.display_name ?? `P${seat}`}</Text>
              <Text className="text-4xl font-bold text-neutral-900 dark:text-white">
                {score.bySeat[seat] ?? 0}
              </Text>
              <Text className="text-xs text-neutral-400">/ {pointTarget}</Text>
            </View>
          );
        })}
      </View>

      <Text className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
        Turn {turnNo}
      </Text>

      <View className="mb-4 gap-2">
        <Text className="text-xs font-medium text-neutral-500">
          {bf1 ? cardName(bf1.card_id) : 'Battlefield 1'}
        </Text>
        <View className="flex-row gap-2">
          {[1, 2].map((seat) => (
            <Pressable
              key={`bf1-${seat}`}
              disabled={!owner || isBusy}
              onPress={() => handleScore(seat, { battlefieldPosition: 1 })}
              className="flex-1 items-center rounded-xl bg-blue-100 py-6 active:bg-blue-200 dark:bg-blue-900 dark:active:bg-blue-800">
              <Text className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                {playerBySeat.get(seat)?.display_name ?? `P${seat}`} +1
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mt-2 text-xs font-medium text-neutral-500">
          {bf2 ? cardName(bf2.card_id) : 'Battlefield 2'}
        </Text>
        <View className="flex-row gap-2">
          {[1, 2].map((seat) => (
            <Pressable
              key={`bf2-${seat}`}
              disabled={!owner || isBusy}
              onPress={() => handleScore(seat, { battlefieldPosition: 2 })}
              className="flex-1 items-center rounded-xl bg-green-100 py-6 active:bg-green-200 dark:bg-green-900 dark:active:bg-green-800">
              <Text className="text-sm font-semibold text-green-900 dark:text-green-100">
                {playerBySeat.get(seat)?.display_name ?? `P${seat}`} +1
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-400">
        Effect / other points
      </Text>
      <View className="mb-6 flex-row gap-2">
        {[1, 2].map((seat) => (
          <Pressable
            key={`effect-${seat}`}
            disabled={!owner || isBusy}
            onPress={() => handleScore(seat, { source: 'effect' })}
            className="flex-1 items-center rounded-xl border border-neutral-300 py-4 dark:border-neutral-600">
            <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              {playerBySeat.get(seat)?.display_name ?? `P${seat}`} +1
            </Text>
          </Pressable>
        ))}
      </View>

      {owner ? (
        <View className="flex-row gap-3">
          <Pressable
            disabled={localEvents.length === 0 || isBusy}
            onPress={handleUndo}
            className="flex-1 items-center rounded-lg border border-neutral-300 py-3 dark:border-neutral-600">
            <Text className="font-semibold text-neutral-700 dark:text-neutral-300">Undo</Text>
          </Pressable>
          <Pressable
            disabled={isBusy}
            onPress={() => setTurnNo((t) => t + 1)}
            className="flex-1 items-center rounded-lg bg-neutral-800 py-3 dark:bg-neutral-200">
            <Text className="font-semibold text-white dark:text-neutral-900">Next turn</Text>
          </Pressable>
        </View>
      ) : null}

      {shareSeat != null && p1 ? (
        <ShareMatchModal
          visible
          onClose={() => setShareSeat(null)}
          matchId={match.id}
          player={shareSeat === 2 && p2 ? p2 : p1}
        />
      ) : null}
    </ScrollView>
  );
}
