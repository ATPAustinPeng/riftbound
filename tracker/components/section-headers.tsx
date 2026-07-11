import { Pressable, Text, View } from 'react-native';
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
      className="flex-row items-center gap-2.5 border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <Text className="text-lg font-bold text-neutral-900 dark:text-white">{label}</Text>
      <View className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
        <Text className="text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
          {owned != null ? `${owned} / ${count}` : count}
        </Text>
      </View>
      {owned != null ? (
        <View className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
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
  tint,
  count,
  setLabel,
  collapsed = false,
  onToggle,
}: {
  label: string;
  dot?: string;
  tint?: string;
  count: number;
  setLabel?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <View className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      {/* Domain color owns the band: a left rail + faint wash, so scrolling a
          set reads as a spectrum. */}
      <View className={`flex-row items-stretch gap-2.5 ${tint ?? ''}`}>
        <View className={`w-1 rounded-r-full ${dot ?? 'bg-neutral-300 dark:bg-neutral-700'}`} />
        <View className="flex-1 flex-row items-center gap-2 py-2.5 pr-2">
          {onToggle ? (
            <View className="h-6 w-6 items-center justify-center rounded-full bg-neutral-900/5 dark:bg-white/10">
              <Text
                className="text-[10px] leading-none text-neutral-600 dark:text-neutral-300"
                style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}>
                ▼
              </Text>
            </View>
          ) : null}
          {setLabel ? (
            <Text className="text-xs font-medium text-neutral-400 dark:text-neutral-600">
              {setLabel} /
            </Text>
          ) : null}
          <Text className="text-base font-bold text-neutral-900 dark:text-white">{label}</Text>
          <View className="rounded-full bg-neutral-900/5 px-2 py-0.5 dark:bg-white/10">
            <Text className="text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {count}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (!onToggle) return content;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={`${label}, ${count} cards, ${collapsed ? 'collapsed' : 'expanded'}`}
      className="hover:bg-neutral-50 active:opacity-70 dark:hover:bg-neutral-900">
      {content}
    </Pressable>
  );
}
