import { useState } from 'react';

/**
 * Value from before the latest change of `value`; `undefined` until it first changes.
 * It is correct in the same render the value changes (no one-render lag).
 */
export function usePrevious<T>(value: T): T | undefined {
  const [state, setState] = useState<{ current: T; previous: T | undefined }>({
    current: value,
    previous: undefined,
  });

  if (!Object.is(state.current, value)) {
    setState({ current: value, previous: state.current });
    return state.current;
  }

  return state.previous;
}
