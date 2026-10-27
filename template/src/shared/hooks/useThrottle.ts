import { useEffect, useRef, useState } from 'react';

/** Returns `value`, updating at most once per `intervalMs`; the trailing value is never lost. */
export function useThrottle<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastRunRef = useRef(0);

  useEffect(() => {
    const elapsed = Date.now() - lastRunRef.current;
    const timer = setTimeout(
      () => {
        lastRunRef.current = Date.now();
        setThrottled(value);
      },
      Math.max(intervalMs - elapsed, 0),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [value, intervalMs]);

  return throttled;
}
