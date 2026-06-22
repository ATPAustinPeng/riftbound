import { type ReactNode, useCallback } from 'react';
import { Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const LIFT_SCALE = 1.03;
const PRESS_SCALE = 0.97;
const HOVER_DURATION = 150;
const PRESS_DURATION = 80;
const RELEASE_DURATION = 120;

interface HoverScaleProps {
  children: ReactNode;
  /** Extra style(s) applied to the animated wrapper (e.g. borderRadius for overflow) */
  style?: object;
  disabled?: boolean;
  onPress?: () => void;
}

/**
 * Wraps its children in a reanimated view that lifts on hover (web) and dips on press.
 * On touch-only devices the hover step is skipped; only the press dip applies.
 */
export function HoverScale({ children, style, disabled = false, onPress }: HoverScaleProps) {
  const scale = useSharedValue(1);
  const isHovered = useSharedValue(false);

  const onHoverIn = useCallback(() => {
    if (disabled) return;
    isHovered.value = true;
    scale.value = withTiming(LIFT_SCALE, { duration: HOVER_DURATION });
  }, [disabled, isHovered, scale]);

  const onHoverOut = useCallback(() => {
    isHovered.value = false;
    scale.value = withTiming(1, { duration: HOVER_DURATION });
  }, [isHovered, scale]);

  const onPressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withTiming(PRESS_SCALE, { duration: PRESS_DURATION });
  }, [disabled, scale]);

  const onPressOut = useCallback(() => {
    // Return to hover-lifted state if still hovering (web), else back to 1
    scale.value = withTiming(isHovered.value ? LIFT_SCALE : 1, { duration: RELEASE_DURATION });
  }, [isHovered, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // react-native-web ignores onHoverIn/onHoverOut on plain Views, so use the raw
  // DOM mouse events (forwarded to the underlying node) on web; native gets none.
  const webProps =
    Platform.OS === 'web'
      ? { onMouseEnter: onHoverIn, onMouseLeave: onHoverOut }
      : {};

  return (
    <Animated.View
      style={[animatedStyle, style]}
        {...webProps}
      onStartShouldSetResponder={() => !disabled}
      onResponderGrant={onPressIn}
      onResponderRelease={() => {
        onPressOut();
        onPress?.();
      }}
      onResponderTerminate={onPressOut}>
      {children}
    </Animated.View>
  );
}
