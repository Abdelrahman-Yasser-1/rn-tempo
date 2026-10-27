import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

import { useLatest } from './useLatest';

/** Calls `refetch` when the screen regains focus, skipping the first focus (TanStack pattern). */
export function useRefreshOnFocus(refetch: () => unknown): void {
  const latestRef = useLatest(refetch);
  const isFirstFocusRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      latestRef.current();
    }, [latestRef]),
  );
}
