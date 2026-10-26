import { logger } from '@services/logger/logger';
import type { AppConfig } from '@services/remote-config/appConfig';
import { initStorage } from '@services/storage/storage';

import { initAuth } from './initAuth';
import { initI18n } from './initI18n';
import { initRemoteConfig } from './initRemoteConfig';
import { initSecurity, type SecurityResult } from './initSecurity';
import { initTheme } from './initTheme';
import type { SecurityReason } from './securityStore';
import { hideSplash } from './splash';
import { evaluateGate } from './versionGate';

export type BlockReason = 'forceUpdate' | 'maintenance' | 'security' | 'startupError';

export type BootstrapResult =
  | { status: 'ready' }
  | { status: 'blocked'; blockReason: BlockReason; securityReasons?: SecurityReason[] };

/** The units of work, injectable so the ordering and failure branches can be tested. */
export type BootstrapSteps = {
  initStorage: () => Promise<void>;
  initTheme: () => void;
  initI18n: () => Promise<void>;
  initSecurity: () => Promise<SecurityResult>;
  initAuth: () => Promise<void>;
  initRemoteConfig: () => Promise<AppConfig>;
  evaluateGate: (config: AppConfig) => ReturnType<typeof evaluateGate>;
  hideSplash: () => Promise<void>;
};

export const defaultSteps: BootstrapSteps = {
  initStorage,
  initTheme,
  initI18n,
  initSecurity,
  initAuth,
  initRemoteConfig,
  evaluateGate,
  hideSplash,
};

const blocked = (
  blockReason: BlockReason,
  securityReasons?: SecurityReason[],
): BootstrapResult => ({ status: 'blocked', blockReason, securityReasons });

async function run(steps: BootstrapSteps): Promise<BootstrapResult> {
  // 1. Storage is required by everything below; failing here is fatal.
  try {
    await steps.initStorage();
  } catch (error) {
    logger.error('Storage initialisation failed', error);
    return blocked('startupError');
  }
  try {
    steps.initTheme();
  } catch (error) {
    logger.warn('Theme preference could not be applied', error);
  }

  // 2. Without translations the blocking screens would show raw keys, so a failure is fatal too.
  try {
    await steps.initI18n();
  } catch (error) {
    logger.error('i18n initialisation failed', error);
    return blocked('startupError');
  }

  // 3. Security before any network request.
  try {
    const security = await steps.initSecurity();
    if (!security.isSafe) {
      return blocked('security', security.reasons);
    }
  } catch (error) {
    // Fail closed: if the checks themselves crash, do not continue unprotected.
    logger.error('Security initialisation failed', error);
    return blocked('security', ['ssl']);
  }

  // 4-5. Session. initAuth handles its own recoverable failures; anything else means signed out.
  try {
    await steps.initAuth();
  } catch (error) {
    logger.error('Auth initialisation failed', error);
    return blocked('startupError');
  }

  // 6-7. Remote config never throws (defaults on failure); the gate decides the entry screen.
  try {
    const config = await steps.initRemoteConfig();
    const gate = steps.evaluateGate(config);
    if (gate !== 'open') {
      return blocked(gate);
    }
  } catch (error) {
    logger.warn('Remote config step failed, continuing with defaults', error);
  }
  return { status: 'ready' };
}

/** Runs the ordered startup sequence and always hides the splash at the end (step 8). */
export async function runBootstrap(steps: BootstrapSteps = defaultSteps): Promise<BootstrapResult> {
  const result = await run(steps);
  try {
    await steps.hideSplash();
  } catch (error) {
    logger.warn('Could not hide the splash screen', error);
  }
  return result;
}
