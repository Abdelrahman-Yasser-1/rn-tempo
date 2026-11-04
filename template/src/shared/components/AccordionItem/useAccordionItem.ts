import { useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ANIMATION_DURATION_MS } from '@shared/constants/motion';

import type { AccordionItemProps } from './types';

type UseAccordionItemParams = Pick<
  AccordionItemProps,
  'expanded' | 'defaultExpanded' | 'onToggle' | 'disabled'
>;

const HALF_TURN_DEG = 180;

/** Controlled or uncontrolled expanded state plus the animated height and chevron rotation. */
export function useAccordionItem({
  expanded: isControlledExpanded,
  defaultExpanded: isDefaultExpanded = false,
  onToggle,
  disabled: isDisabled = false,
}: UseAccordionItemParams) {
  const isReducedMotion = useReducedMotion();
  const [isInternalExpanded, setIsInternalExpanded] = useState(isDefaultExpanded);
  const isExpanded = isControlledExpanded ?? isInternalExpanded;
  const progress = useSharedValue(isExpanded ? 1 : 0);
  const contentHeight = useSharedValue(0);

  // Drive the animation from the resolved state, so a controlled change animates too.
  useEffect(() => {
    progress.set(
      withTiming(isExpanded ? 1 : 0, { duration: isReducedMotion ? 0 : ANIMATION_DURATION_MS }),
    );
  }, [isExpanded, isReducedMotion, progress]);

  const onPress = () => {
    if (isDisabled) {
      return;
    }
    const willExpand = !isExpanded;
    if (isControlledExpanded === undefined) {
      setIsInternalExpanded(willExpand);
    }
    onToggle?.(willExpand);
  };

  const onContentLayout = (event: LayoutChangeEvent) => {
    contentHeight.set(event.nativeEvent.layout.height);
  };

  const panelStyle = useAnimatedStyle(() => ({
    height: contentHeight.value * progress.value,
    opacity: progress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${String(interpolate(progress.value, [0, 1], [0, HALF_TURN_DEG]))}deg` },
    ],
  }));

  return { isExpanded, onPress, onContentLayout, panelStyle, chevronStyle };
}
