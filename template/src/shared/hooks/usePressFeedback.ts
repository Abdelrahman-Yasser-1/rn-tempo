import { useCallback } from 'react';
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const PRESSED_OPACITY = 0.7;
const PRESSED_SCALE = 0.97;
const PRESS_DURATION_MS = 100;

/**
 * Press feedback for touchables: fades and slightly scales the target while pressed. With
 * reduced motion enabled it only fades, instantly. Spread `handlers` on a Pressable and apply
 * `animatedStyle` to an `Animated.View` inside it.
 */
export function usePressFeedback() {
  const isReducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, PRESSED_OPACITY]),
    transform: [
      { scale: isReducedMotion ? 1 : interpolate(progress.value, [0, 1], [1, PRESSED_SCALE]) },
    ],
  }));

  const onPressIn = useCallback(() => {
    progress.set(withTiming(1, { duration: isReducedMotion ? 0 : PRESS_DURATION_MS }));
  }, [isReducedMotion, progress]);

  const onPressOut = useCallback(() => {
    progress.set(withTiming(0, { duration: isReducedMotion ? 0 : PRESS_DURATION_MS }));
  }, [isReducedMotion, progress]);

  return { animatedStyle, handlers: { onPressIn, onPressOut } };
}
