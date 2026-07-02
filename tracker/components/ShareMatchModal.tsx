import * as Linking from 'expo-linking';
import { useCallback } from 'react';
import { Modal, Platform, Pressable, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { buildMatchShareUrl } from '@/lib/games';
import type { MatchPlayer } from '@/lib/types';

interface ShareMatchModalProps {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  player: MatchPlayer;
}

export function ShareMatchModal({ visible, onClose, matchId, player }: ShareMatchModalProps) {
  const claimToken = player.claim_token;
  const url =
    claimToken != null
      ? buildMatchShareUrl(matchId, player.seat, claimToken)
      : Linking.createURL(`match/${matchId}`);

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Join my Riftbound match as ${player.display_name}: ${url}`,
        url: Platform.OS === 'ios' ? url : undefined,
      });
    } catch {
      // user cancelled
    }
  }, [player.display_name, url]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-end bg-black/50">
        <View className="w-full max-w-md rounded-t-2xl bg-white p-6 dark:bg-neutral-900">
          <Text className="mb-1 text-lg font-bold text-neutral-900 dark:text-white">
            Share match
          </Text>
          <Text className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Scan or share this link so {player.display_name} can claim their seat and see the match
            in their history.
          </Text>

          <View className="mb-4 items-center rounded-xl bg-white p-4 dark:bg-neutral-800">
            <QRCode value={url} size={180} />
          </View>

          <Text className="mb-4 text-center text-xs text-neutral-500" selectable>
            {url}
          </Text>

          <View className="flex-row gap-3">
            <Pressable
              onPress={onShare}
              className="flex-1 items-center rounded-lg bg-blue-600 py-3">
              <Text className="font-semibold text-white">Share link</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="flex-1 items-center rounded-lg border border-neutral-300 py-3 dark:border-neutral-600">
              <Text className="font-semibold text-neutral-700 dark:text-neutral-300">Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function DomainChipPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (domains: string[]) => void;
}) {
  const domains = [
    { id: 'fury', label: 'Fury', dot: 'bg-red-500' },
    { id: 'body', label: 'Body', dot: 'bg-orange-500' },
    { id: 'order', label: 'Order', dot: 'bg-yellow-400' },
    { id: 'calm', label: 'Calm', dot: 'bg-green-500' },
    { id: 'mind', label: 'Mind', dot: 'bg-blue-500' },
    { id: 'chaos', label: 'Chaos', dot: 'bg-purple-500' },
  ];

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((d) => d !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <View className="flex-row flex-wrap gap-2">
      {domains.map((d) => {
        const active = selected.includes(d.id);
        return (
          <Pressable
            key={d.id}
            onPress={() => toggle(d.id)}
            className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
              active
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}>
            <View className={`h-2.5 w-2.5 rounded-full ${d.dot}`} />
            <Text
              className={`text-xs font-medium ${
                active ? 'text-blue-700 dark:text-blue-300' : 'text-neutral-600 dark:text-neutral-400'
              }`}>
              {d.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
