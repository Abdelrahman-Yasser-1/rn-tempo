import { useCallback, useEffect, useRef } from 'react';

import { useLatest } from './useLatest';

/**
 * Debounced `run` for `callback`: it fires `delayMs` after the last call, with the last arguments.
 * `run` and `cancel` are stable; `cancel` drops a pending call, and unmounting cancels too.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
) {
  const latestRef = useLatest(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const run = useCallback(
    (...args: Args) => {
      cancel();
      timerRef.current = setTimeout(() => {
        latestRef.current(...args);
      }, delayMs);
    },
    [cancel, delayMs, latestRef],
  );

  useEffect(() => cancel, [cancel]);

  return { run, cancel };
}
