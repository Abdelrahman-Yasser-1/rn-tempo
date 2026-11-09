import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** A ref that always holds the value of the last committed render (read it in effects and timers). */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
