import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';

interface ExportMissingModalProps {
  visible: boolean;
  onClose: () => void;
  csv: string;
  count: number;
  filename: string;
}

export function ExportMissingModal({
  visible,
  onClose,
  csv,
  count,
  filename,
}: ExportMissingModalProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Clipboard.setStringAsync(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      return;
    }

    await Share.share({ message: csv });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          className="max-h-[85%] rounded-t-2xl bg-white dark:bg-neutral-900"
          onPress={(e) => e.stopPropagation()}>
          <View className="flex-row items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <Text className="text-lg font-semibold text-neutral-900 dark:text-white">
              Export missing
            </Text>
            <Pressable onPress={onClose} className="rounded-full px-3 py-1">
              <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">Close</Text>
            </Pressable>
          </View>

          <View className="gap-3 px-4 py-3">
            <Text className="text-sm text-neutral-600 dark:text-neutral-400">
              {count} card{count === 1 ? '' : 's'} / lines to acquire
            </Text>

            <ScrollView
              className="max-h-64 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950"
              nestedScrollEnabled>
              <Text
                className="font-mono text-xs text-neutral-800 dark:text-neutral-200"
                selectable>
                {csv}
              </Text>
            </ScrollView>

            <View className="flex-row gap-2 pb-4">
              <Pressable
                onPress={() => void handleCopy()}
                className="flex-1 items-center rounded-full border border-neutral-300 bg-white py-2.5 dark:border-neutral-700 dark:bg-neutral-800">
                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {copied ? 'Copied' : 'Copy'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleShare()}
                className="flex-1 items-center rounded-full border border-blue-600 bg-blue-600 py-2.5">
                <Text className="text-sm font-semibold text-white">Share</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
