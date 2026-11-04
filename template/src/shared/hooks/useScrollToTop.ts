import { useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** The scroll methods this hook uses, so it works with ScrollView and FlashList refs alike. */
type ScrollTarget = {
  scrollTo?(options: { y: number; animated: boolean }): void;
  scrollToOffset?(params: { offset: number; animated: boolean }): void;
};

type ScrollTargetRef = Readonly<{ current: ScrollTarget | null }>;

const DEFAULT_THRESHOLD = 300;

/**
 * Tracks whether a scrollable has moved past `threshold` points, for a scroll-to-top button.
 * Attach `onScroll` to the list (with `scrollEventThrottle`) and call `scrollToTop` on press.
 */
export function useScrollToTop(ref: ScrollTargetRef, threshold: number = DEFAULT_THRESHOLD) {
  const [isVisible, setIsVisible] = useState(false);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIsVisible(event.nativeEvent.contentOffset.y > threshold);
  };

  const scrollToTop = () => {
    const target = ref.current;
    if (target?.scrollToOffset) {
      target.scrollToOffset({ offset: 0, animated: true });
    } else {
      target?.scrollTo?.({ y: 0, animated: true });
    }
  };

  return { isVisible, onScroll, scrollToTop };
}
