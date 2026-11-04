import { useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ANIMATION_DURATION_MS } from '@shared/constants/motion';
import { useRtl } from '@shared/hooks';

import type { SegmentedControlProps } from './types';

export const MAX_SEGMENTS = 4;

type UseSegmentedControlParams = Pick<SegmentedControlProps, 'items' | 'value'> & {
  /** Space between the track edge and the thumb, in points. */
  inset: number;
};

/** Measures the track and slides the selection thumb under the selected segment. */
export function useSegmentedControl({ items, value, inset }: UseSegmentedControlParams) {
  const isRtl = useRtl();
  const isReducedMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const offset = useSharedValue(0);

  const segments = items.slice(0, MAX_SEGMENTS);
  const index = Math.max(
    0,
    segments.findIndex((item) => item.key === value),
  );
  const segmentWidth = segments.length === 0 ? 0 : (trackWidth - inset * 2) / segments.length;
  const direction = isRtl ? -1 : 1;

  useEffect(() => {
    offset.set(
      withTiming(direction * index * segmentWidth, {
        duration: isReducedMotion ? 0 : ANIMATION_DURATION_MS,
      }),
    );
  }, [direction, index, segmentWidth, isReducedMotion, offset]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: offset.value }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return { segments, thumbStyle, onLayout };
}
