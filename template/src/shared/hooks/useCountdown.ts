import { useCallback, useState } from 'react';

import { useInterval } from './useInterval';

const TICK_MS = 1000;

/** Counts down from `seconds` once per second after `start()`; `reset()` stops and restores it. */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  const [isRunning, setIsRunning] = useState(false);

  useInterval(
    () => {
      if (remaining <= 1) {
        setIsRunning(false);
      }
      setRemaining((current) => Math.max(current - 1, 0));
    },
    isRunning ? TICK_MS : null,
  );

  const start = useCallback(() => {
    setRemaining((current) => (current <= 0 ? seconds : current));
    setIsRunning(true);
  }, [seconds]);

  const reset = useCallback(() => {
    setIsRunning(false);
    setRemaining(seconds);
  }, [seconds]);

  return { remaining, isRunning, start, reset };
}
