import { useEffect } from 'react';
import RNShake from 'react-native-shake';

import { isProd } from '@config/env';
import { navigationRef } from '@navigation/navigationRef';

const DEBUG_ROUTES: ReadonlySet<string> = new Set(['DebugMenu', 'NetworkLog']);

/** Opens the debug menu unless it is already showing; false when navigation is not ready. */
export function openDebugMenu(): boolean {
  if (!navigationRef.isReady()) {
    return false;
  }
  const current = navigationRef.getCurrentRoute()?.name;
  if (current !== undefined && DEBUG_ROUTES.has(current)) {
    return false;
  }
  navigationRef.navigate('DebugMenu');
  return true;
}

/**
 * Non-prod only: shaking the device opens the debug menu. The `isProd` check is a runtime guard,
 * so production builds never subscribe to the sensor.
 */
export function useShakeToOpenDebugMenu(): void {
  useEffect(() => {
    if (isProd) {
      return;
    }
    const subscription = RNShake.addListener(() => {
      openDebugMenu();
    });
    return () => {
      subscription.remove();
    };
  }, []);
}
