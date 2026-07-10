import { Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';

// Fixed so web sticky headers know where to pin below the set header.
export const SET_HEADER_HEIGHT = 48;

// react-native-web supports position: 'sticky' but RN's style types don't include it.
export const WEB_STICKY_SET = { position: 'sticky', top: 0, zIndex: 20 } as unknown as ViewStyle;
export const WEB_STICKY_BAND_TOP = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
} as unknown as ViewStyle;
export const WEB_STICKY_BAND_BELOW_SET = {
  position: 'sticky',
  top: SET_HEADER_HEIGHT,
  zIndex: 10,
} as unknown as ViewStyle;

export function SetHeader({
  label,
  count,
  owned,
}: {
  label: string;
  count: number;
  owned?: number;
}) {
  return (
    <View
      style={{ height: SET_HEADER_HEIGHT }}
      className="flex-row items-end gap-2 border-b border-neutral-200 bg-white pb-2 dark:border-neutral-800 dark:bg-neutral-950">
      <Text className="text-lg font-bold text-neutral-900 dark:text-white">{label}</Text>
      <Text className="pb-1 text-xs text-neutral-400 dark:text-neutral-500">
        {owned != null ? `${owned}/${count}` : count}
      </Text>
      {owned != null ? (
        <View className="mb-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <View
            className={`h-full rounded-full ${owned >= count ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${count > 0 ? (owned / count) * 100 : 0}%` }}
          />
        </View>
      ) : null}
    </View>
  );
}

export function DomainBandHeader({
  label,
  dot,
  count,
  setLabel,
}: {
  label: string;
  dot?: string;
  count: number;
  setLabel?: string;
}) {
  return (
    <View className="flex-row items-end gap-2 border-b border-neutral-200 bg-white pb-2 pt-4 dark:border-neutral-800 dark:bg-neutral-950">
      {setLabel ? (
        <Text className="pb-0.5 text-xs font-medium text-neutral-300 dark:text-neutral-600">
          {setLabel} /
        </Text>
      ) : null}
      {dot ? <View className={`mb-1 h-3 w-3 rounded-full ${dot}`} /> : null}
      <Text className="text-base font-bold text-neutral-900 dark:text-white">{label}</Text>
      <Text className="pb-0.5 text-xs text-neutral-400 dark:text-neutral-500">{count}</Text>
    </View>
  );
}
