// @tempo-feature:device-integrity:start
import JailMonkey from 'jail-monkey';
import { Platform } from 'react-native';

import { ENV, isProd } from '@config/env';
import { logger } from '@services/logger/logger';

export type IntegrityReason = 'jailbroken' | 'debugMode' | 'hookDetected';

export type IntegrityResult = {
  isCompromised: boolean;
  reasons: IntegrityReason[];
};

export type IntegrityDecision = {
  /** Whether bootstrap must show the blocking SecurityErrorScreen. */
  shouldBlock: boolean;
  reasons: IntegrityReason[];
};

/** Runs the jail-monkey checks. Only call on real builds: rooted emulators and debuggers are normal in dev. */
export async function checkDeviceIntegrity(): Promise<IntegrityResult> {
  const reasons: IntegrityReason[] = [];
  if (JailMonkey.isJailBroken()) {
    reasons.push('jailbroken');
  }
  if (await JailMonkey.isDebuggedMode()) {
    reasons.push('debugMode');
  }
  if (Platform.OS === 'android' && JailMonkey.hookDetected()) {
    reasons.push('hookDetected');
  }
  return { isCompromised: reasons.length > 0, reasons };
}

/**
 * Applies the policy: checks run only when `DEVICE_INTEGRITY_ENABLED` and not in a dev (`__DEV__`)
 * bundle; a compromise blocks the app in prod and only logs in other flavors.
 */
export async function runIntegrityPolicy(): Promise<IntegrityDecision> {
  if (!ENV.DEVICE_INTEGRITY_ENABLED || __DEV__) {
    return { shouldBlock: false, reasons: [] };
  }
  const { isCompromised, reasons } = await checkDeviceIntegrity();
  if (!isCompromised) {
    return { shouldBlock: false, reasons: [] };
  }
  logger.warn('Device integrity check failed', reasons);
  return { shouldBlock: isProd, reasons };
}
// @tempo-feature:device-integrity:end
