import { useState } from 'react';

import {
  getCrashReportsOptOut,
  setCrashReportsOptOut,
} from '@services/crash-reporting/crashReporting';
import { logger } from '@services/logger/logger';

/** Logic of the "Share crash reports" row: on means the user has not opted out. */
export function useCrashReportsRow() {
  const [isShared, setIsShared] = useState(() => !getCrashReportsOptOut());

  const onToggle = (isOn: boolean) => {
    setIsShared(isOn);
    setCrashReportsOptOut(!isOn).catch((error: unknown) => {
      logger.warn('Crash reports: could not apply the choice', error);
    });
  };

  return { isShared, onToggle };
}
