import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent, ScrollViewInstance } from 'react-native';

import type { TabsProps } from './types';

type UseTabsParams = Pick<TabsProps, 'items' | 'value'>;

const SCROLL_PADDING = 16;

/** Keeps the selected tab in view when the row scrolls. Returns the scroll ref separately. */
export function useTabs({ items, value }: UseTabsParams) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsetsRef = useRef(new Map<string, number>());

  const onTabLayout = (key: string, event: LayoutChangeEvent) => {
    offsetsRef.current.set(key, event.nativeEvent.layout.x);
  };

  const hasItems = items.length > 0;
  useEffect(() => {
    const offset = offsetsRef.current.get(value);
    if (hasItems && offset !== undefined) {
      scrollRef.current?.scrollTo({ x: Math.max(0, offset - SCROLL_PADDING), animated: true });
    }
  }, [value, hasItems]);

  return { scrollRef, onTabLayout };
}
