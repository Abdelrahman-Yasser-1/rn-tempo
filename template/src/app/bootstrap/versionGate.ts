import { Platform } from 'react-native';

import { APP_VERSION } from '@config/constants';
import type { AppConfig } from '@services/remote-config/appConfig';
import { versionCompare } from '@shared/utils/version';

export type GateResult = 'open' | 'forceUpdate' | 'maintenance';

/** Bootstrap step 7: below the minimum supported version wins over maintenance mode. */
export function evaluateGate(config: AppConfig, currentVersion: string = APP_VERSION): GateResult {
  const minimum =
    Platform.OS === 'ios' ? config.minSupportedVersion.ios : config.minSupportedVersion.android;
  if (versionCompare(currentVersion, minimum) < 0) {
    return 'forceUpdate';
  }
  return config.maintenance.enabled ? 'maintenance' : 'open';
}
