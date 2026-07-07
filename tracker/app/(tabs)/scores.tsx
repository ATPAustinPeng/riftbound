import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, View } from 'react-native';

import { MatchRow } from '@/components/match';
import { StatCard } from '@/components/StatCard';
import { getActiveMatchState, hasDirtyWork, useMatchStore } from '@/lib/match-store';
import { retrySync } from '@/lib/match-sync';
import {
  useCardsIndex,
  useDeleteMatchMutation,
  useMatchesQuery,
  useMatchGamesQuery,
  useMatchStats,
} from '@/lib/queries';
import type { MatchGame, MatchWithLegends } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

/** Alert.alert is a no-op on react-native-web; fall back to window.confirm. */
function confirmDestructive(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

/** Completed games in game_number order as "8–6, 5–8" (my–opponent), or null. */
function formatGameScores(games: MatchGame[] | undefined): string | null {
  const completed = (games ?? [])
    .filter((game) => game.status === 'completed')
    .sort((a, b) => a.game_number - b.game_number);
  if (completed.length === 0) return null;
  return completed.map((game) => `${game.my_score}–${game.opponent_score}`).join(', ');
}

function MatchRowSkeleton() {
  return (
    <View className="mb-3 gap-2 rounded-xl border border-border bg-card p-3">
      <Skeleton className="h-4 w-3/4" />
      <View className="flex-row gap-2">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </View>
    </View>
  );
}

export default function ScoresScreen() {
  const router = useRouter();
  const matchesQuery = useMatchesQuery();
  const gamesQuery = useMatchGamesQuery();
  const cardsQuery = useCardsIndex();
  const { stats, isLoading: statsLoading } = useMatchStats();
  const deleteMatch = useDeleteMatchMutation();
  const { isHydrated, state } = useMatchStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Retry any unsynced local match work whenever this tab gains focus.
  // Reads the store imperatively (empty deps) so it fires once per focus,
  // not on every store change while focused.
  useFocusEffect(
    useCallback(() => {
      const active = getActiveMatchState();
      if (active && hasDirtyWork(active)) retrySync();
    }, []),
  );

  const gamesByMatchId = useMemo(() => {
    const map = new Map<string, MatchGame[]>();
    for (const game of gamesQuery.data ?? []) {
      const list = map.get(game.match_id);
      if (list) list.push(game);
      else map.set(game.match_id, [game]);
    }
    return map;
  }, [gamesQuery.data]);

  const cardNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of cardsQuery.data?.cards ?? []) map.set(card.id, card.name);
    return map;
  }, [cardsQuery.data]);

  // Hide the active (local) match from the history list; the resume banner owns it.
  const matches = useMemo(() => {
    const rows = matchesQuery.data ?? [];
    if (!state) return rows;
    return rows.filter((match) => match.id !== state.match.id);
  }, [matchesQuery.data, state]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await matchesQuery.refetch();
    setIsRefreshing(false);
  }, [matchesQuery]);

  const handleDelete = useCallback(
    (match: MatchWithLegends) => {
      confirmDestructive(
        'Delete match?',
        'This removes the match, its games, and its event log permanently.',
        () => deleteMatch.mutate(match.id),
      );
    },
    [deleteMatch],
  );

  if (matchesQuery.isLoading) {
    return (
      <View className="flex-1 bg-background px-4 pb-8 pt-2">
        <View className="mb-3 flex-row gap-3">
          <Skeleton className="h-20 flex-1 rounded-xl" />
          <Skeleton className="h-20 flex-1 rounded-xl" />
        </View>
        <Skeleton className="mb-3 h-10 w-full rounded-md" />
        {Array.from({ length: 5 }).map((_, i) => (
          <MatchRowSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (matchesQuery.isError) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-destructive">Could not load match history.</Text>
        <Button
          onPress={() => void handleRefresh()}
          disabled={matchesQuery.isRefetching}
          variant="outline">
          <Text>{matchesQuery.isRefetching ? 'Retrying…' : 'Tap to retry'}</Text>
        </Button>
      </View>
    );
  }

  const record = `${stats.wins}–${stats.losses}${stats.draws > 0 ? `–${stats.draws}` : ''}`;
  const winRate = statsLoading ? '—' : `${Math.round(stats.winRate * 100)}%`;

  const activeMyName = state?.match.my_legend_card_id
    ? (cardNameById.get(state.match.my_legend_card_id) ?? 'Me')
    : (state?.match.my_deck_name ?? 'Me');
  const activeOppName = state?.match.opponent_legend_card_id
    ? (cardNameById.get(state.match.opponent_legend_card_id) ?? 'Opponent')
    : (state?.match.opponent_deck_name ?? 'Opponent');

  return (
    <FlatList
      className="flex-1 bg-background"
      data={matches}
      keyExtractor={(match) => match.id}
      contentContainerClassName="px-4 pb-8 pt-2"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />
      }
      ListHeaderComponent={
        <View className="mb-3 gap-3">
          <View className="flex-row gap-3">
            <StatCard label="Record" value={record} subtitle="win–loss" />
            <StatCard label="Win rate" value={winRate} subtitle={`${stats.matchesPlayed} matches`} />
            <StatCard label="Games" value={stats.gamesPlayed} subtitle="completed" />
          </View>

          {isHydrated && state ? (
            <Pressable
              onPress={() => router.push(`/match/${state.match.id}`)}
              className="flex-row items-center gap-3 rounded-xl bg-primary/10 p-3 active:opacity-80">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">Match in progress</Text>
                <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
                  {activeMyName} vs {activeOppName}
                </Text>
              </View>
              <View className="rounded-md bg-primary px-3 py-1.5">
                <Text className="text-xs font-semibold text-primary-foreground">Continue</Text>
              </View>
            </Pressable>
          ) : null}

          <Button size="lg" onPress={() => router.push('/match/new')}>
            <Text>New Match</Text>
          </Button>

          <Text variant="small" className="text-muted-foreground">
            {matches.length} match{matches.length === 1 ? '' : 'es'} recorded
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View className="items-center py-12">
          <Text variant="muted" className="text-center text-base">
            No matches yet. Start a new match to track scores live.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View className="mb-3">
          <MatchRow
            match={item}
            games={formatGameScores(gamesByMatchId.get(item.id))}
            onPress={() => router.push(`/match/${item.id}`)}
            onLongPress={() => handleDelete(item)}
          />
        </View>
      )}
    />
  );
}
