import { useEffect } from 'react';
import { BackHandler } from 'react-native';

import { useLatest } from './useLatest';

/** Android hardware back. Return `true` from `handler` to consume the press. No-op on iOS. */
export function useBackHandler(handler: () => boolean): void {
  const latestRef = useLatest(handler);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      latestRef.current(),
    );
    return () => {
      subscription.remove();
    };
  }, [latestRef]);
}
