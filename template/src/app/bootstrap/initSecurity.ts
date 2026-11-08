// @tempo-feature:device-integrity:start
import { runIntegrityPolicy } from '@services/security/integrity/integrity';
// @tempo-feature:device-integrity:end
// @tempo-feature:ssl-pinning:start
import { initPinning } from '@services/security/pinning/pinning';
// @tempo-feature:ssl-pinning:end

// @tempo-feature:ssl-pinning:start
import { useSecurityStore } from './securityStore';
// @tempo-feature:ssl-pinning:end
import type { SecurityReason } from './securityStore';

export type SecurityResult = {
  /** `false` when startup must stop on the blocking security screen. */
  isSafe: boolean;
  reasons: SecurityReason[];
};

type SecurityStep = () => Promise<SecurityResult>;

// @tempo-feature:ssl-pinning:start
async function checkPinning(): Promise<SecurityResult> {
  const isPinned = await initPinning({
    onSecurityCompromised: (reason) => {
      useSecurityStore.getState().reportCompromise(reason);
    },
  });
  return isPinned ? { isSafe: true, reasons: [] } : { isSafe: false, reasons: ['ssl'] };
}
// @tempo-feature:ssl-pinning:end

// @tempo-feature:device-integrity:start
async function checkIntegrity(): Promise<SecurityResult> {
  const { shouldBlock, reasons } = await runIntegrityPolicy();
  return { isSafe: !shouldBlock, reasons: shouldBlock ? reasons : [] };
}
// @tempo-feature:device-integrity:end

// Each module adds one step, so removing a module removes one line here and nothing else.
// Pinning runs first: it gates every request, and a failure stops the remaining steps.
// `Array.of` rather than a literal: with both modules removed the list is legitimately empty.
const STEPS: readonly SecurityStep[] = Array.of<SecurityStep>(
  checkPinning, // @tempo-feature:ssl-pinning
  checkIntegrity, // @tempo-feature:device-integrity
);

/** Bootstrap step 3: SSL pinning first (it gates every request), then the device integrity policy. */
export async function initSecurity(): Promise<SecurityResult> {
  for (const step of STEPS) {
    const result = await step();
    if (!result.isSafe) {
      return result;
    }
  }
  return { isSafe: true, reasons: [] };
}
