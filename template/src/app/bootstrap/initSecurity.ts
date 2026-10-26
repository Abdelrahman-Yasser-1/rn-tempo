// @tempo-feature:device-integrity:start
import { runIntegrityPolicy } from '@services/security/integrity/integrity';
// @tempo-feature:device-integrity:end
// @tempo-feature:ssl-pinning:start
import { initPinning } from '@services/security/pinning/pinning';
// @tempo-feature:ssl-pinning:end

import { useSecurityStore, type SecurityReason } from './securityStore';

export type SecurityResult = {
  /** `false` when startup must stop on the blocking security screen. */
  isSafe: boolean;
  reasons: SecurityReason[];
};

/** Bootstrap step 3: SSL pinning first (it gates every request), then the device integrity policy. */
export async function initSecurity(): Promise<SecurityResult> {
  let result: SecurityResult = { isSafe: true, reasons: [] };
  // @tempo-feature:ssl-pinning:start
  const isPinned = await initPinning({
    onSecurityCompromised: (reason) => {
      useSecurityStore.getState().reportCompromise(reason);
    },
  });
  if (!isPinned) {
    return { isSafe: false, reasons: ['ssl'] };
  }
  // @tempo-feature:ssl-pinning:end
  // @tempo-feature:device-integrity:start
  const { shouldBlock, reasons } = await runIntegrityPolicy();
  result = { isSafe: !shouldBlock, reasons: shouldBlock ? reasons : [] };
  // @tempo-feature:device-integrity:end
  return result;
}
