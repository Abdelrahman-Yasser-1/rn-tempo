import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

import { useLatest } from './useLatest';

/** Runs `callback` every time the screen gains focus (including the first time). */
export function useOnFocus(callback: () => void): void {
  const latestRef = useLatest(callback);

  useFocusEffect(
    useCallback(() => {
      latestRef.current();
    }, [latestRef]),
  );
}
