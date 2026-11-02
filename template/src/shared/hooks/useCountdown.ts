import { useCallback, useState } from 'react';

import { useInterval } from './useInterval';

const TICK_MS = 1000;

/**
 * Counts down from `seconds` once per second after `start()`; `reset()` stops and restores it.
 * `isRunning` is derived from the rendered `remaining`, so it turns false the moment it hits 0
 * even when several ticks land before React commits.
 */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  const [isStarted, setIsStarted] = useState(false);
  const isRunning = isStarted && remaining > 0;

  useInterval(
    () => {
      setRemaining((current) => Math.max(current - 1, 0));
    },
    isRunning ? TICK_MS : null,
  );

  const start = useCallback(() => {
    setRemaining((current) => (current <= 0 ? seconds : current));
    setIsStarted(true);
  }, [seconds]);

  const reset = useCallback(() => {
    setIsStarted(false);
    setRemaining(seconds);
  }, [seconds]);

  return { remaining, isRunning, start, reset };
}
