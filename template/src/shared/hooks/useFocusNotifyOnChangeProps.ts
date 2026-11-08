import { useFocusEffect } from '@react-navigation/native';
import type { NotifyOnChangeProps } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

type NotifyOnChangeValue = Exclude<NotifyOnChangeProps, () => unknown>;

/**
 * Value for a query's `notifyOnChangeProps`: a screen that is still mounted under another one in
 * the stack stops re-rendering on query updates until it is focused again (TanStack Query's React
 * Native "disable re-renders on out of focus screens" pattern). Pass the screen's own
 * `notifyOnChangeProps` to keep it for the focused state.
 */
export function useFocusNotifyOnChangeProps(
  notifyOnChangeProps?: NotifyOnChangeProps,
): () => NotifyOnChangeValue {
  const isFocusedRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      return () => {
        isFocusedRef.current = false;
      };
    }, []),
  );

  return () => {
    const resolved =
      typeof notifyOnChangeProps === 'function' ? notifyOnChangeProps() : notifyOnChangeProps;
    return isFocusedRef.current ? resolved : [];
  };
}
