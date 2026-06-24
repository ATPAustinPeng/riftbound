import { useRef, useState } from 'react';
import {
  PanResponder,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';

interface ColumnSliderProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}

const THUMB_SIZE = 20;
const TRACK_HEIGHT = 36;

/** Disable page-wide text selection while dragging (web only). */
function setBodySelectable(selectable: boolean) {
  if (typeof document === 'undefined' || !document.body) return;
  const style = document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string };
  style.userSelect = selectable ? '' : 'none';
  style.webkitUserSelect = selectable ? '' : 'none';
}

/**
 * Dependency-free, cross-platform slider for picking grid column count.
 * Drag-only (a plain tap does nothing); uses core PanResponder so it works
 * on web and native without a native module.
 */
export function ColumnSlider({ value, min = 3, max = 8, onChange }: ColumnSliderProps) {
  const { width: screenWidth } = useWindowDimensions();
  const sliderWidth = Math.round(screenWidth / 4);
  const [trackWidth, setTrackWidth] = useState(0);

  // Keep the latest props in a ref so the (once-created) PanResponder reads fresh values.
  const cfg = useRef({ value, min, max, trackWidth, onChange });
  cfg.current = { value, min, max, trackWidth, onChange };

  const drag = useRef({ startRatio: 0 });

  const steps = Math.max(1, max - min);
  const ratio = Math.min(1, Math.max(0, (value - min) / steps));

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const c = cfg.current;
        const span = Math.max(1, c.max - c.min);
        drag.current.startRatio = Math.min(1, Math.max(0, (c.value - c.min) / span));
        setBodySelectable(false);
      },
      onPanResponderMove: (_e, gesture) => {
        const c = cfg.current;
        const span = c.max - c.min;
        if (c.trackWidth <= 0 || span <= 0) return;
        const r = Math.min(1, Math.max(0, drag.current.startRatio + gesture.dx / c.trackWidth));
        const next = c.min + Math.round(r * span);
        if (next !== c.value) c.onChange(next);
      },
      onPanResponderRelease: () => setBodySelectable(true),
      onPanResponderTerminate: () => setBodySelectable(true),
    }),
  ).current;

  return (
    <View
      {...responder.panHandlers}
      onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{
        width: sliderWidth,
        height: TRACK_HEIGHT,
        justifyContent: 'center',
        userSelect: 'none',
        cursor: 'pointer',
      }}>
      <View className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700">
        <View
          className="h-full rounded-full bg-blue-600"
          style={{ width: `${ratio * 100}%` }}
        />
      </View>
      <View
        pointerEvents="none"
        className="absolute rounded-full border border-neutral-300 bg-white shadow-md dark:border-neutral-500"
        style={{
          height: THUMB_SIZE,
          width: THUMB_SIZE,
          top: '50%',
          marginTop: -THUMB_SIZE / 2,
          left: `${ratio * 100}%`,
          marginLeft: -THUMB_SIZE / 2,
        }}
      />
    </View>
  );
}
