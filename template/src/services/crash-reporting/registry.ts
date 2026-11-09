import type { CrashReporterName } from '@config/crashReporters';

import { crashlyticsProvider } from './adapters/crashlytics'; // @tempo-feature:crashlytics
import { noopProvider } from './noop';
import type { CrashReporter, CrashReporterProvider } from './types';

/**
 * Provider name to provider. `CRASH_REPORTER` picks one. Adding a provider (the Sentry recipe) is
 * a name in `src/config/crashReporters.ts` plus an entry here; TypeScript fails until both exist.
 */
const PROVIDERS: Record<CrashReporterName, CrashReporterProvider> = {
  none: noopProvider,
  crashlytics: crashlyticsProvider, // @tempo-feature:crashlytics
};

/** Whether the named provider can run in this build. */
export function isCrashReporterAvailable(name: CrashReporterName): boolean {
  return PROVIDERS[name].isAvailable();
}

/** Builds the named provider's reporter. */
export function createCrashReporter(name: CrashReporterName): CrashReporter {
  return PROVIDERS[name].create();
}
