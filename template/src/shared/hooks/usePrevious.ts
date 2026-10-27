import { useEffect, useRef, useState } from 'react';

/** Value from the previous render; `undefined` on the first one. */
export function usePrevious<T>(value: T): T | undefined {
  const [previous, setPrevious] = useState<T | undefined>(undefined);
  const valueRef = useRef(value);

  useEffect(() => {
    setPrevious(valueRef.current);
    valueRef.current = value;
  }, [value]);

  return previous;
}
