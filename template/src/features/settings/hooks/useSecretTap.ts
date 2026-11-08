import { useCallback, useRef } from 'react';

import { SECRET_TAP_COUNT, SECRET_TAP_WINDOW_MS } from '@features/settings/constants';

/** Returns a press handler that calls `onUnlock` after enough taps inside the time window. */
export function useSecretTap(onUnlock: () => void) {
  const tapTimesRef = useRef<number[]>([]);

  return useCallback(() => {
    const now = Date.now();
    const recent = tapTimesRef.current.filter((time) => now - time <= SECRET_TAP_WINDOW_MS);
    recent.push(now);
    if (recent.length >= SECRET_TAP_COUNT) {
      tapTimesRef.current = [];
      onUnlock();
      return;
    }
    tapTimesRef.current = recent;
  }, [onUnlock]);
}
