import type { InitOptions } from 'i18next';

import { logger } from '@services/logger/logger';

type DevOptionsInput = Readonly<{
  /** `__DEV__`: the options below apply to development builds only. */
  isDev: boolean;
  /** `ENV.LOG_LEVEL`: i18next `debug` turns on only for `debug`. */
  logLevel: string;
  /** Jest run: `debug` stays off, it would print every lookup into the test output. */
  isTest: boolean;
}>;

/**
 * Warns about a key that no language has. Logs where the key is missing, never the interpolation
 * options or the fallback text, which can hold user data.
 */
export function logMissingKey(languages: readonly string[], namespace: string, key: string): void {
  logger.warn('i18n: missing translation key', {
    language: languages.join(','),
    namespace,
    key,
  });
}

/** i18next options that only development builds get: missing-key warnings and verbose debug. */
export function getDevOptions({
  isDev,
  logLevel,
  isTest,
}: DevOptionsInput): Pick<InitOptions, 'saveMissing' | 'missingKeyHandler' | 'debug'> {
  if (!isDev) {
    return {};
  }
  return {
    saveMissing: true,
    missingKeyHandler: logMissingKey,
    debug: logLevel === 'debug' && !isTest,
  };
}
