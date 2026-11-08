import { initI18nInstance } from '@services/i18n/i18n';
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
import { runSteps, type BootstrapStep } from './stepGraph';
import { evaluateGate } from './versionGate';

export type BlockReason = 'forceUpdate' | 'maintenance' | 'security' | 'startupError';

export type BootstrapResult =
  | { status: 'ready' }
  | { status: 'blocked'; blockReason: BlockReason; securityReasons?: SecurityReason[] };

/** Why startup stopped, as a step reports it. */
type BlockResult = { blockReason: BlockReason; securityReasons?: SecurityReason[] };

/** The units of work, injectable so the ordering and failure branches can be tested. */
export type BootstrapSteps = {
  initStorage: () => Promise<void>;
  initTheme: () => void;
  initI18n: () => Promise<void>;
  /** Best-effort `en` init so blocking screens can show text when the normal path failed early. */
  initFallbackI18n: () => Promise<void>;
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
  initFallbackI18n: () => initI18nInstance('en'),
  initSecurity,
  initAuth,
  initRemoteConfig,
  evaluateGate,
  hideSplash,
};

/** A startup failure screen needs translations even if language resolution (storage) failed. */
async function blockedWithStartupError(steps: BootstrapSteps): Promise<BlockResult> {
  try {
    await steps.initFallbackI18n();
  } catch (error) {
    logger.warn('Fallback i18n initialisation failed', error);
  }
  return { blockReason: 'startupError' };
}

/**
 * The startup steps with their dependencies. Declaration order breaks ties, so the sequential
 * order is storage, theme, i18n, security, auth, remote config.
 */
export function createBootstrapSteps(steps: BootstrapSteps): BootstrapStep<BlockResult>[] {
  return [
    // Storage is required by everything below; failing here is fatal.
    {
      id: 'storage',
      dependsOn: [],
      onError: 'fatal',
      failureMessage: 'Storage initialisation failed',
      run: async () => {
        await steps.initStorage();
      },
    },
    {
      id: 'theme',
      dependsOn: ['storage'],
      onError: 'continue',
      failureMessage: 'Theme preference could not be applied',
      run: () => {
        steps.initTheme();
        return Promise.resolve(undefined);
      },
    },
    // Without translations the blocking screens would show raw keys, so a failure is fatal too.
    {
      id: 'i18n',
      dependsOn: ['storage'],
      onError: 'fatal',
      failureMessage: 'i18n initialisation failed',
      run: async () => {
        await steps.initI18n();
      },
    },
    // Security before any network request. If the checks themselves crash, fail closed.
    {
      id: 'security',
      dependsOn: ['i18n'],
      onError: 'block-security',
      failureMessage: 'Security initialisation failed',
      run: async (): Promise<BlockResult | undefined> => {
        const security = await steps.initSecurity();
        return security.isSafe
          ? undefined
          : { blockReason: 'security', securityReasons: security.reasons };
      },
    },
    // Session. initAuth handles its own recoverable failures; anything else is fatal.
    {
      id: 'auth',
      dependsOn: ['security'],
      onError: 'fatal',
      failureMessage: 'Auth initialisation failed',
      run: async () => {
        await steps.initAuth();
      },
    },
    // Remote config never throws (defaults on failure); the gate decides the entry screen.
    {
      id: 'remote-config',
      dependsOn: ['auth'],
      onError: 'continue',
      failureMessage: 'Remote config step failed, continuing with defaults',
      run: async (): Promise<BlockResult | undefined> => {
        const config = await steps.initRemoteConfig();
        const gate = steps.evaluateGate(config);
        return gate === 'open' ? undefined : { blockReason: gate };
      },
    },
  ];
}

async function run(steps: BootstrapSteps): Promise<BootstrapResult> {
  const block = await runSteps(createBootstrapSteps(steps), {
    fatal: () => blockedWithStartupError(steps),
    blockSecurity: (): BlockResult => ({ blockReason: 'security', securityReasons: ['ssl'] }),
  });
  return block ? { status: 'blocked', ...block } : { status: 'ready' };
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
