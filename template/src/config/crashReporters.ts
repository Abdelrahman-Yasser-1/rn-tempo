/**
 * The crash reporting providers `CRASH_REPORTER` accepts. The matching reporters are registered in
 * `src/services/crash-reporting/registry.ts`. The Sentry recipe adds `'sentry'` here and there.
 */
export const CRASH_REPORTER_NAMES = [
  'none',
  'crashlytics', // @tempo-feature:crashlytics
] as const;

export type CrashReporterName = (typeof CRASH_REPORTER_NAMES)[number];
