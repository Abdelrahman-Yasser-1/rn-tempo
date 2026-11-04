import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ANIMATION_DURATION_MS } from '@shared/constants/motion';

const SLIDE_DISTANCE = 16;

/** Entrance animation of the layout content: a fade plus a short slide up. Off for reduced motion. */
export function useScreenLayout(isAnimated: boolean) {
  const isReducedMotion = useReducedMotion();
  const shouldAnimate = isAnimated && !isReducedMotion;
  const progress = useSharedValue(shouldAnimate ? 0 : 1);

  useEffect(() => {
    progress.set(withTiming(1, { duration: shouldAnimate ? ANIMATION_DURATION_MS : 0 }));
  }, [shouldAnimate, progress]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * SLIDE_DISTANCE }],
  }));

  return { contentStyle };
}
