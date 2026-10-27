import { useCallback, useState } from 'react';

/** Boolean state with a `toggle` and an explicit setter. */
export function useToggle(isInitiallyOn = false) {
  const [isOn, setIsOn] = useState(isInitiallyOn);

  const toggle = useCallback(() => {
    setIsOn((wasOn) => !wasOn);
  }, []);

  return [isOn, toggle, setIsOn] as const;
}
