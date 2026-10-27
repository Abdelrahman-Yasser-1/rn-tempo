import { useEffect } from 'react';

import { useLatest } from './useLatest';

/** Calls `callback` every `delayMs`. Pass `null` as the delay to pause. */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const latestRef = useLatest(callback);

  useEffect(() => {
    const timer =
      delayMs === null
        ? undefined
        : setInterval(() => {
            latestRef.current();
          }, delayMs);
    return () => {
      clearInterval(timer);
    };
  }, [delayMs, latestRef]);
}
