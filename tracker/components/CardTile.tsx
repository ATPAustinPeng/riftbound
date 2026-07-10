import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { QtyStepper } from '@/components/QtyStepper';
import { canBeFoil } from '@/lib/queries';
import type { Card } from '@/lib/types';

// Reanimated's Animated.View doesn't reliably pick up NativeWind classNames for
// sizing, so size the image wrapper with an explicit style.
const FILL = { width: '100%', height: '100%' } as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CardTileProps {
  card: Card;
  /** Only required in quickAdd mode so React.memo can use a stable id-aware callback */
  cardId?: string;
  owned?: number;
  foilOwned?: number;
  forSale?: number;
  wishlisted?: boolean;
  showSteppers?: boolean;
  quickAdd?: boolean;
  onOwnedChange?: (next: number) => void;
  onFoilChange?: (next: number) => void;
  onForSaleChange?: (next: number) => void;
  /** Stable id-aware callback — avoids re-creating a closure per item in quickAdd grids */
  onQuickOwnedChange?: (cardId: string, next: number) => void;
  onQuickFoilChange?: (cardId: string, next: number) => void;
  compact?: boolean;
  dimmed?: boolean;
  foilMissing?: boolean;
}

// ---------------------------------------------------------------------------
// Quick-add overlay — sits over the bottom of the image, always visible.
// The container uses pointerEvents="box-none" so only the pill captures taps;
// the transparent area passes touches through to the detail Link beneath.
// ---------------------------------------------------------------------------

// A single +/− pill for one finish (normal or foil). Keeps its own local
// display count so the number flips on the same tap without waiting for the
// query cache to propagate through FlashList.
function CountPill({
  serverCount,
  onChange,
  foil,
}: {
  serverCount: number;
  onChange: (next: number) => void;
  foil?: boolean;
}) {
  const [display, setDisplay] = useState(serverCount);
  useEffect(() => {
    setDisplay(serverCount);
  }, [serverCount]);

  const countScale = useSharedValue(1);
  const hasMounted = useRef(false);
  useEffect(() => {
    // Pop only on count changes — mount included would make every tile's
    // number flash when the grid remounts cells.
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    countScale.value = withSequence(
      withTiming(1.35, { duration: 90 }),
      withTiming(1, { duration: 90 }),
    );
  }, [display, countScale]);

  const countStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countScale.value }],
  }));

  const change = useCallback(
    (next: number) => {
      const clamped = Math.max(0, next);
      setDisplay(clamped);
      onChange(clamped);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [onChange],
  );

  const pillBase = foil
    ? 'flex-row items-center gap-0.5 rounded-full bg-amber-50 shadow-md'
    : 'flex-row items-center gap-0.5 rounded-full bg-white shadow-md';

  const countColor = foil ? 'text-amber-900' : 'text-neutral-900';

  return (
    <View className={`${pillBase} px-1 py-0.5`}>
      {foil ? (
        <Text className="px-0.5 text-[10px] font-bold leading-none text-amber-500">✦</Text>
      ) : null}
      <QuickBtn onPress={() => change(display - 1)} label="−" />
      <Animated.Text
        style={countStyle}
        className={`min-w-[18px] text-center text-xs font-bold ${countColor}`}>
        {display}
      </Animated.Text>
      <QuickBtn onPress={() => change(display + 1)} label="+" />
      <QuickBtn onPress={() => change(display + 3)} label="+3" />
    </View>
  );
}

function QuickAddOverlay({
  owned,
  foilOwned,
  onOwnedChange,
  onFoilChange,
  canFoil,
}: {
  owned: number;
  foilOwned: number;
  onOwnedChange: (next: number) => void;
  onFoilChange: (next: number) => void;
  canFoil: boolean;
}) {
  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-1.5 left-0 right-0 z-10 items-center gap-1">
      <CountPill serverCount={owned} onChange={onOwnedChange} />
      {canFoil ? (
        <CountPill serverCount={foilOwned} onChange={onFoilChange} foil />
      ) : null}
    </View>
  );
}

/** Compact +/− button with press scale feedback (dark glyph for the white pill) */
function QuickBtn({ onPress, label }: { onPress: () => void; label: string }) {
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    scale.value = withTiming(0.8, { duration: 60 });
  }, [scale]);

  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 100 });
  }, [scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={8}
      className="h-6 min-w-6 items-center justify-center rounded-full px-1">
      <Animated.Text style={style} className="text-sm font-bold leading-none text-neutral-900">
        {label}
      </Animated.Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Card image (+ badges)
// ---------------------------------------------------------------------------

function CardImage({ card }: { card: Card }) {
  const [failed, setFailed] = useState(false);

  if (card.image_url && !failed) {
    return (
      <Image
        source={{ uri: card.image_url }}
        accessibilityLabel={card.image_alt ?? card.name}
        className="h-full w-full"
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }

  // No URL or the image failed to load — keep the card name in the box.
  return (
    <View className="flex-1 items-center justify-center p-1">
      <Text
        className="text-center text-[11px] font-medium text-neutral-500 dark:text-neutral-400"
        numberOfLines={4}>
        {card.name}
      </Text>
    </View>
  );
}

function CardBadges({
  owned,
  foilOwned,
  wishlisted,
  showOwnedBadge,
  canFoil,
  foilMissing,
}: {
  owned: number;
  foilOwned: number;
  wishlisted: boolean;
  showOwnedBadge: boolean;
  canFoil: boolean;
  foilMissing?: boolean;
}) {
  const totalOwned = owned + foilOwned;

  return (
    <View pointerEvents="none" className="absolute inset-0">
      {showOwnedBadge && totalOwned > 0 ? (
        canFoil ? (
          <View className="absolute right-1 top-1 items-end gap-0.5">
            {owned > 0 ? (
              <View className="rounded-full bg-blue-600 px-2 py-0.5">
                <Text className="text-xs font-bold text-white">×{owned}</Text>
              </View>
            ) : null}
            {foilOwned > 0 ? (
              <View className="flex-row items-center gap-0.5 rounded-full bg-amber-400 px-2 py-0.5">
                <Text className="text-[10px] font-bold leading-none text-amber-950">✦</Text>
                <Text className="text-xs font-bold text-amber-950">×{foilOwned}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View className="absolute right-1 top-1 rounded-full bg-blue-600 px-2 py-0.5">
            <Text className="text-xs font-bold text-white">×{totalOwned}</Text>
          </View>
        )
      ) : foilMissing ? (
        <View
          className="absolute right-1 top-1 rounded-full border border-dashed border-amber-400 px-1.5 py-0.5 opacity-40">
          <Text className="text-[10px] font-bold leading-none text-amber-500">✦</Text>
        </View>
      ) : null}
      {wishlisted ? (
        <View className="absolute left-1 top-1 rounded-full bg-pink-600 px-1.5 py-0.5">
          <Text className="text-xs text-white">♥</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tile
// ---------------------------------------------------------------------------

function CardTileInner({
  card,
  cardId,
  owned = 0,
  foilOwned = 0,
  forSale = 0,
  wishlisted = false,
  showSteppers = false,
  quickAdd = false,
  onOwnedChange,
  onFoilChange,
  onForSaleChange,
  onQuickOwnedChange,
  onQuickFoilChange,
  compact = false,
  dimmed = false,
  foilMissing = false,
}: CardTileProps) {
  const id = cardId ?? card.id;
  const cardCanFoil = canBeFoil(card);
  const totalOwned = owned + foilOwned;
  const showOwnedBadge = totalOwned > 0 && !quickAdd;

  // Hover/press grow only the IMAGE, letting it pop out past the tile frame
  // (the image box + card allow overflow). The hovered tile is z-raised so the
  // overflowing image draws over its neighbors instead of being painted under.
  const isHovered = useSharedValue(0);
  const imageScale = useSharedValue(1);

  const onHoverIn = useCallback(() => {
    isHovered.value = 1;
    imageScale.value = withTiming(1.07, { duration: 150 });
  }, [isHovered, imageScale]);

  const onHoverOut = useCallback(() => {
    isHovered.value = 0;
    imageScale.value = withTiming(1, { duration: 150 });
  }, [isHovered, imageScale]);

  const onPressIn = useCallback(() => {
    imageScale.value = withTiming(0.98, { duration: 80 });
  }, [imageScale]);

  const onPressOut = useCallback(() => {
    imageScale.value = withTiming(isHovered.value === 1 ? 1.15 : 1, { duration: 120 });
  }, [imageScale, isHovered]);

  const imageScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: imageScale.value }],
  }));

  // react-native-web ignores onHoverIn/onHoverOut on plain Views; the raw DOM
  // mouse events are forwarded to the underlying node, so use those on web.
  const webHoverProps =
    Platform.OS === 'web'
      ? { onMouseEnter: onHoverIn, onMouseLeave: onHoverOut }
      : {};

  const quickOwnedCb = onQuickOwnedChange
    ? (next: number) => onQuickOwnedChange(id, next)
    : onOwnedChange;

  const quickFoilCb = onQuickFoilChange
    ? (next: number) => onQuickFoilChange(id, next)
    : onFoilChange;

  const imageArea = (
    <View
      {...webHoverProps}
      className="relative aspect-[5/7] w-full rounded-md bg-neutral-100 dark:bg-neutral-800">
      <View
        className={`absolute inset-0 ${dimmed ? 'opacity-40' : ''}`}
        style={dimmed && Platform.OS === 'web' ? { filter: 'grayscale(1)' } : undefined}>
        {quickAdd ? (
          <Link href={`/card/${card.id}`} asChild>
            <Pressable className="absolute inset-0" onPressIn={onPressIn} onPressOut={onPressOut}>
              <Animated.View style={[imageScaleStyle, FILL]}>
                <CardImage card={card} />
              </Animated.View>
            </Pressable>
          </Link>
        ) : (
          <Animated.View style={[imageScaleStyle, FILL]}>
            <CardImage card={card} />
          </Animated.View>
        )}
        <CardBadges
          owned={owned}
          foilOwned={foilOwned}
          wishlisted={wishlisted}
          showOwnedBadge={quickAdd ? totalOwned > 0 : showOwnedBadge}
          canFoil={cardCanFoil}
          foilMissing={foilMissing && !dimmed}
        />
      </View>
      {quickAdd && quickOwnedCb && quickFoilCb ? (
        <QuickAddOverlay
          owned={owned}
          foilOwned={foilOwned}
          onOwnedChange={quickOwnedCb}
          onFoilChange={quickFoilCb}
          canFoil={cardCanFoil}
        />
      ) : null}
    </View>
  );

  const content = (
    <View
      className={`overflow-hidden rounded-lg bg-white dark:bg-neutral-900 ${
        compact ? 'p-1' : 'p-2'
      }`}>
      {imageArea}

      {showSteppers && onOwnedChange && onForSaleChange ? (
        <View className="mt-2 gap-2">
          <QtyStepper label="Owned" value={owned} onChange={onOwnedChange} compact />
          <QtyStepper label="For sale" value={forSale} onChange={onForSaleChange} compact />
        </View>
      ) : null}
    </View>
  );

  if (showSteppers || quickAdd) {
    return content;
  }

  return (
    <Link href={`/card/${card.id}`} asChild>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
        {content}
      </Pressable>
    </Link>
  );
}

export const CardTile = memo(CardTileInner);
