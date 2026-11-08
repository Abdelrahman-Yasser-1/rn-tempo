import { useCallback, useRef, useState } from 'react';
import type { FlatList, FlatListProps } from 'react-native';

import { SLIDES, type Slide } from '@features/onboarding/constants';
import { useOnboardingStore } from '@features/onboarding/store/onboarding.store';

type ViewableChangeHandler = NonNullable<FlatListProps<Slide>['onViewableItemsChanged']>;

const LAST_INDEX = SLIDES.length - 1;

/** Logic of the onboarding screen: paging state, the next/skip actions and the list ref. */
export function useOnboardingScreen() {
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const complete = useOnboardingStore((state) => state.complete);
  const isLast = activeIndex === LAST_INDEX;

  // Viewability is layout-agnostic, so paging stays correct in RTL where scroll offsets mirror.
  const onViewableChange = useCallback<ViewableChangeHandler>(({ viewableItems }) => {
    const index = viewableItems[0]?.index;
    if (typeof index === 'number') {
      setActiveIndex(index);
    }
  }, []);

  const onNext = () => {
    if (isLast) {
      complete();
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  };

  return { listRef, activeIndex, isLast, onViewableChange, onNext, onSkip: complete };
}
