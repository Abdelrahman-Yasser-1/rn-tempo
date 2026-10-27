import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

function readState(): AppStateStatus {
  const { currentState } = AppState;
  return currentState === 'background' || currentState === 'inactive' ? currentState : 'active';
}

/** Current app state (`active`, `background`, `inactive`), updated on change. */
export function useAppState(): AppStateStatus {
  const [status, setStatus] = useState<AppStateStatus>(readState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setStatus);
    return () => {
      subscription.remove();
    };
  }, []);

  return status;
}
