import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BattlefieldPicker, LegendPicker } from '@/components/CardPickers';
import { DomainChipPicker } from '@/components/ShareMatchModal';
import { useAuth } from '@/lib/auth-context';
import { useCreateMatchMutation } from '@/lib/games';
import type { MatchType } from '@/lib/types';

interface PlayerForm {
  display_name: string;
  legend_card_id: string | null;
  domains: string[];
  deck_name: string;
}

const emptyPlayer = (): PlayerForm => ({
  display_name: '',
  legend_card_id: null,
  domains: [],
  deck_name: '',
});

export default function NewMatchScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const createMatch = useCreateMatchMutation();

  const [matchType, setMatchType] = useState<MatchType>('bo1');
  const [pointTarget, setPointTarget] = useState<8 | 10>(8);
  const [players, setPlayers] = useState<[PlayerForm, PlayerForm]>([
    { ...emptyPlayer(), display_name: profile?.display_name ?? 'Player 1' },
    { ...emptyPlayer(), display_name: 'Player 2' },
  ]);
  const [battlefields, setBattlefields] = useState<[string | null, string | null]>([null, null]);
  const [firstPlayerSeat, setFirstPlayerSeat] = useState<1 | 2>(1);

  const updatePlayer = (index: 0 | 1, patch: Partial<PlayerForm>) => {
    setPlayers((prev) => {
      const next: [PlayerForm, PlayerForm] = [...prev] as [PlayerForm, PlayerForm];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const canSubmit =
    players[0].display_name.trim() &&
    players[1].display_name.trim() &&
    players[0].legend_card_id &&
    players[1].legend_card_id &&
    battlefields[0] &&
    battlefields[1];

  const onSubmit = async () => {
    if (!canSubmit) {
      Alert.alert('Missing info', 'Fill in both players, legends, and battlefields.');
      return;
    }

    try {
      const match = await createMatch.mutateAsync({
        match_type: matchType,
        point_target: pointTarget,
        first_player_seat: firstPlayerSeat,
        battlefields: [battlefields[0]!, battlefields[1]!],
        players: [
          {
            seat: 1,
            display_name: players[0].display_name.trim(),
            legend_card_id: players[0].legend_card_id!,
            domains: players[0].domains,
            deck_name: players[0].deck_name.trim() || undefined,
          },
          {
            seat: 2,
            display_name: players[1].display_name.trim(),
            legend_card_id: players[1].legend_card_id!,
            domains: players[1].domains,
            deck_name: players[1].deck_name.trim() || undefined,
          },
        ],
      });
      router.replace(`/match/${match.id}/record`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create match');
    }
  };

  return (
    <ScrollView className="flex-1 bg-white dark:bg-neutral-950" contentContainerClassName="px-4 pb-10 pt-2">
      <Text className="mb-4 text-2xl font-bold text-neutral-900 dark:text-white">New match</Text>

      <View className="mb-6 gap-3">
        <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Format</Text>
        <Text className="text-sm text-neutral-500">1v1 (Phase 1)</Text>

        <Text className="mt-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">Series</Text>
        <View className="flex-row gap-2">
          {(['bo1', 'bo3'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setMatchType(t)}
              className={`rounded-lg px-4 py-2 ${
                matchType === t ? 'bg-blue-600' : 'bg-neutral-200 dark:bg-neutral-800'
              }`}>
              <Text
                className={`font-semibold ${
                  matchType === t ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
                }`}>
                {t.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mt-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">Point target</Text>
        <View className="flex-row gap-2">
          {([8, 10] as const).map((n) => (
            <Pressable
              key={n}
              onPress={() => setPointTarget(n)}
              className={`rounded-lg px-4 py-2 ${
                pointTarget === n ? 'bg-blue-600' : 'bg-neutral-200 dark:bg-neutral-800'
              }`}>
              <Text
                className={`font-semibold ${
                  pointTarget === n ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
                }`}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {([0, 1] as const).map((idx) => (
        <View key={idx} className="mb-6 gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <Text className="text-base font-bold text-neutral-900 dark:text-white">
            Player {idx + 1}
          </Text>
          <TextInput
            value={players[idx].display_name}
            onChangeText={(v) => updatePlayer(idx, { display_name: v })}
            placeholder="Display name"
            placeholderTextColor="#9ca3af"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
          <TextInput
            value={players[idx].deck_name}
            onChangeText={(v) => updatePlayer(idx, { deck_name: v })}
            placeholder="Deck name (optional)"
            placeholderTextColor="#9ca3af"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />
          <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Domains</Text>
          <DomainChipPicker
            selected={players[idx].domains}
            onChange={(domains) => updatePlayer(idx, { domains })}
          />
          <LegendPicker
            selectedId={players[idx].legend_card_id}
            onSelect={(id) => updatePlayer(idx, { legend_card_id: id })}
            label={`Player ${idx + 1} legend`}
          />
        </View>
      ))}

      <View className="mb-6 gap-4">
        <BattlefieldPicker
          selectedId={battlefields[0]}
          onSelect={(id) => setBattlefields([id, battlefields[1]])}
          label="Battlefield 1"
        />
        <BattlefieldPicker
          selectedId={battlefields[1]}
          onSelect={(id) => setBattlefields([battlefields[0], id])}
          label="Battlefield 2"
        />
      </View>

      <View className="mb-8 gap-2">
        <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">First player</Text>
        <View className="flex-row gap-2">
          {([1, 2] as const).map((seat) => (
            <Pressable
              key={seat}
              onPress={() => setFirstPlayerSeat(seat)}
              className={`flex-1 items-center rounded-lg py-3 ${
                firstPlayerSeat === seat ? 'bg-blue-600' : 'bg-neutral-200 dark:bg-neutral-800'
              }`}>
              <Text
                className={`font-semibold ${
                  firstPlayerSeat === seat ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
                }`}>
                {players[seat - 1].display_name || `Player ${seat}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        disabled={!canSubmit || createMatch.isPending}
        onPress={onSubmit}
        className={`items-center rounded-xl py-4 ${canSubmit ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'}`}>
        {createMatch.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-bold text-white">Start recording</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
