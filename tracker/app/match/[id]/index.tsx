import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { ShareMatchModal } from '@/components/ShareMatchModal';
import { useAuth } from '@/lib/auth-context';
import {
  deriveScore,
  getMatchSeriesScore,
  isMatchOwner,
  parseScorePayload,
  useClaimMatchPlayerMutation,
  useMatch,
} from '@/lib/games';
import { useCardsIndex } from '@/lib/queries';
import type { MatchPlayer } from '@/lib/types';

export default function MatchReviewScreen() {
  const { id, claim, seat } = useLocalSearchParams<{ id: string; claim?: string; seat?: string }>();
  const { user } = useAuth();
  const matchQuery = useMatch(id);
  const cardsQuery = useCardsIndex();
  const claimMutation = useClaimMatchPlayerMutation();
  const [sharePlayer, setSharePlayer] = useState<MatchPlayer | null>(null);
  const [claimAttempted, setClaimAttempted] = useState(false);

  const match = matchQuery.data;

  useEffect(() => {
    if (!claim || !user?.id || claimAttempted || claimMutation.isPending) return;
    setClaimAttempted(true);

    claimMutation
      .mutateAsync(claim)
      .then(() => {
        Alert.alert('Seat claimed', 'This match now appears in your Games history.');
        matchQuery.refetch();
      })
      .catch((err) => {
        Alert.alert('Could not claim', err instanceof Error ? err.message : 'Invalid or expired link');
      });
  }, [claim, user?.id, claimAttempted, claimMutation.isPending]);

  const cardById = useMemo(() => {
    const map = new Map<string, { name: string; image_url: string | null }>();
    for (const c of cardsQuery.data?.cards ?? []) {
      map.set(c.id, { name: c.name, image_url: c.image_url });
    }
    return map;
  }, [cardsQuery.data?.cards]);

  const seriesScore = match ? getMatchSeriesScore(match.games) : {};

  if (matchQuery.isLoading || cardsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!match) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-neutral-950">
        <Text className="text-center text-neutral-600 dark:text-neutral-400">Match not found.</Text>
      </View>
    );
  }

  const owner = isMatchOwner(match, user?.id);
  const activeGame = match.games.find((g) => g.winner_seat == null);
  const seatNum = seat ? Number.parseInt(seat, 10) : null;

  return (
    <ScrollView className="flex-1 bg-white dark:bg-neutral-950" contentContainerClassName="px-4 pb-10 pt-2">
      <View className="mb-4 flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-2xl font-bold text-neutral-900 dark:text-white">Match</Text>
          <Text className="text-sm text-neutral-500">
            {new Date(match.played_at).toLocaleDateString()} · {match.match_type.toUpperCase()} · first to{' '}
            {match.point_target}
          </Text>
          {Object.keys(seriesScore).length > 0 ? (
            <Text className="mt-1 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Series:{' '}
              {match.players
                .map((p) => `${p.display_name} ${seriesScore[p.seat] ?? 0}`)
                .join(' – ')}
            </Text>
          ) : null}
        </View>
        {owner && activeGame ? (
          <Link href={`/match/${match.id}/record`} asChild>
            <Pressable className="rounded-lg bg-blue-600 px-3 py-2">
              <Text className="text-xs font-semibold text-white">Resume</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>

      <View className="mb-6 flex-row gap-3">
        {match.players.map((player) => {
          const legend = cardById.get(player.legend_card_id);
          return (
            <View
              key={player.id}
              className="flex-1 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              {legend?.image_url ? (
                <Image
                  source={{ uri: legend.image_url }}
                  className="mb-2 h-28 w-full"
                  resizeMode="contain"
                />
              ) : null}
              <Text className="font-bold text-neutral-900 dark:text-white">{player.display_name}</Text>
              <Text className="text-xs text-neutral-500">{legend?.name ?? 'Unknown legend'}</Text>
              {player.domains.length > 0 ? (
                <Text className="mt-1 text-xs text-neutral-400">{player.domains.join(', ')}</Text>
              ) : null}
              {owner && player.claim_token ? (
                <Pressable
                  onPress={() => setSharePlayer(player)}
                  className="mt-2 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-600">
                  <Text className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400">
                    Share seat {player.seat}
                  </Text>
                </Pressable>
              ) : null}
              {player.user_id === user?.id ? (
                <Text className="mt-1 text-[10px] font-medium text-green-600">Claimed by you</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {claim && seatNum ? (
        <View className="mb-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
          <Text className="text-sm text-blue-800 dark:text-blue-200">
            Claim link detected for seat {seatNum}.{' '}
            {claimMutation.isPending ? 'Claiming…' : claimAttempted ? 'Done.' : 'Processing…'}
          </Text>
        </View>
      ) : null}

      {match.games.map((game) => {
        const score = deriveScore(game.events);
        const bfNames = game.battlefields.map(
          (b) => cardById.get(b.card_id)?.name ?? `BF ${b.position}`,
        );

        return (
          <View
            key={game.id}
            className="mb-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-neutral-900 dark:text-white">
                Game {game.game_no}
              </Text>
              {game.winner_seat != null ? (
                <Text className="text-sm font-semibold text-green-600">
                  {match.players.find((p) => p.seat === game.winner_seat)?.display_name ?? 'Winner'}{' '}
                  wins
                </Text>
              ) : (
                <Text className="text-sm text-neutral-400">In progress</Text>
              )}
            </View>

            <Text className="mb-2 text-xs text-neutral-500">
              {bfNames.join(' vs ')} · first:{' '}
              {match.players.find((p) => p.seat === game.first_player_seat)?.display_name ?? '?'}
            </Text>

            <View className="mb-3 flex-row justify-around rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
              {match.players.map((p) => (
                <Text key={p.id} className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                  {p.display_name}: {score.bySeat[p.seat] ?? 0}
                </Text>
              ))}
            </View>

            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Timeline
            </Text>
            {game.events.length === 0 ? (
              <Text className="text-sm text-neutral-400">No events recorded.</Text>
            ) : (
              game.events.map((event) => {
                const parsed = parseScorePayload(event);
                if (!parsed) {
                  return (
                    <Text key={event.id} className="py-1 text-xs text-neutral-400">
                      Turn {event.turn_no}: {event.event_type}
                    </Text>
                  );
                }
                const scorer = match.players.find((p) => p.seat === parsed.scorer_seat);
                const bfLabel =
                  parsed.battlefield_position != null
                    ? bfNames[parsed.battlefield_position - 1] ?? `BF${parsed.battlefield_position}`
                    : 'Effect';
                return (
                  <View
                    key={event.id}
                    className="flex-row items-center gap-2 border-b border-neutral-100 py-2 dark:border-neutral-800">
                    <Text className="w-12 text-xs text-neutral-400">T{event.turn_no}</Text>
                    <Text className="flex-1 text-sm text-neutral-800 dark:text-neutral-200">
                      {scorer?.display_name ?? `P${parsed.scorer_seat}`} +{parsed.points} ({bfLabel})
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        );
      })}

      {sharePlayer ? (
        <ShareMatchModal
          visible
          onClose={() => setSharePlayer(null)}
          matchId={match.id}
          player={sharePlayer}
        />
      ) : null}
    </ScrollView>
  );
}
