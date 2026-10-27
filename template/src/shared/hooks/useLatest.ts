import { useEffect, useRef } from 'react';

/** Ref that always holds the latest value, so timers and listeners never see stale closures. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
