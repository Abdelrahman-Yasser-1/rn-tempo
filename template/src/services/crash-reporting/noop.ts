import type { CrashReporter, CrashReporterProvider } from './types';

/** Accepts a call and drops it. */
const doNothing = (): void => {
  // Nothing to do: this reporter accepts every call and drops it.
};

/** The reporter of `CRASH_REPORTER=none`: accepts every call and does nothing. */
export const noopReporter: CrashReporter = {
  /** Nothing to start. */
  init: () => Promise.resolve(),
  /** Nothing to switch. */
  setEnabled: () => Promise.resolve(),
  /** Nothing is ever stored. */
  discardPending: () => Promise.resolve(),
  /** Drops the error. */
  recordError: doNothing,
  /** Drops the breadcrumb. */
  log: doNothing,
  /** Drops the user. */
  setUser: doNothing,
  /** Drops the attributes. */
  setAttributes: doNothing,
};

/** Registry entry of `none`: always available. */
export const noopProvider: CrashReporterProvider = {
  /** Returns the shared no-op reporter. */
  create: () => noopReporter,
  /** The no-op reporter can always run. */
  isAvailable: () => true,
};
