import { APP_BUNDLE_ID, APP_VERSION } from '@config/constants';
import { ENV } from '@config/env';
import { addLogSink } from '@services/logger/logger';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

import { installRedactingErrorHandler } from './globalErrorHandler';
import { createCrashLogSink } from './logSink';
import { noopReporter } from './noop';
import { createCrashReporter, isCrashReporterAvailable } from './registry';
import type { CrashAttributes, CrashReporter } from './types';

/** The provider that records reports; stays the no-op until it started successfully. */
let reporter: CrashReporter = noopReporter;
/**
 * The provider whose native collection switch this build controls, kept even when its start
 * failed, so turning collection off and discarding reports always reach the SDK.
 */
let collector: CrashReporter = noopReporter;
let isOptedOut = false;
let removeSink: (() => void) | undefined;
let restoreErrorHandler: (() => void) | undefined;

/**
 * Whether this build can report at all: `CRASH_REPORTING_ENABLED=true`, a provider other than `none`
 * and that provider can run here. This decides whether the Settings switch is shown.
 */
export function isCrashReportingConfigured(): boolean {
  return (
    ENV.CRASH_REPORTING_ENABLED &&
    ENV.CRASH_REPORTER !== 'none' &&
    isCrashReporterAvailable(ENV.CRASH_REPORTER)
  );
}

/** Whether reports are collected right now: configured, a release build and the user has not opted out. */
export function isCrashReportingActive(): boolean {
  return isCrashReportingConfigured() && !__DEV__ && !isOptedOut;
}

/** The user's choice in Settings: true when they asked not to share crash reports. */
export function getCrashReportsOptOut(): boolean {
  return isOptedOut;
}

/** Breadcrumb attached to the next report. Does nothing while collection is off. */
export function logBreadcrumb(message: string): void {
  if (isCrashReportingActive()) {
    reporter.log(message);
  }
}

/** Records a handled error. Every report carries `app_env`. Does nothing while collection is off. */
export function recordError(error: Error, context?: CrashAttributes): void {
  if (isCrashReportingActive()) {
    reporter.recordError(error, { ...context, app_env: ENV.APP_ENV });
  }
}

/**
 * Sets (or with `null` clears) the user id on reports. Pass an opaque id, never an email or a name:
 * nothing else about the user is ever sent. Does nothing while collection is off.
 */
export function setCrashUser(id: string | null): void {
  if (isCrashReportingActive()) {
    reporter.setUser(id);
  }
}

/** Adds attributes to every report. Does nothing while collection is off. */
export function setCrashAttributes(attributes: CrashAttributes): void {
  if (isCrashReportingActive()) {
    reporter.setAttributes(attributes);
  }
}

/**
 * Starts crash reporting: reads the user's opt-out (storage must be open), switches the provider's
 * collection off (SDKs remember the switch across launches), discards reports kept on the device
 * when this run must not report, starts the provider, tags every report with `app_env`, then turns
 * collection on only when {@link isCrashReportingActive}. Warnings become breadcrumbs and bugs
 * logged with `logError` become non-fatals, through a log sink, and uncaught errors reach the
 * provider's own global handler only as redacted copies. If the provider fails to start,
 * collection stays off and the error is rethrown.
 */
export async function initCrashReporting(): Promise<void> {
  isOptedOut = storage.getBoolean(STORAGE_KEYS.crashReportsOptOut) ?? false;
  const name = ENV.CRASH_REPORTER;
  if (name === 'none' || !isCrashReporterAvailable(name)) {
    return;
  }
  const candidate = createCrashReporter(name);
  collector = candidate;
  await candidate.setEnabled(false);
  if (!isCrashReportingActive()) {
    await candidate.discardPending();
  }
  if (!isCrashReportingConfigured()) {
    return;
  }
  await candidate.init({
    appEnv: ENV.APP_ENV,
    version: APP_VERSION,
    bundleId: APP_BUNDLE_ID,
  });
  candidate.setAttributes({ app_env: ENV.APP_ENV });
  // The redacting handler and the sink go in before collection is switched on, so no uncaught
  // error can reach the provider unredacted. The provider's own handler already exists (the SDK
  // installed it on first use, above), so this one still wraps it.
  restoreErrorHandler?.();
  restoreErrorHandler = installRedactingErrorHandler();
  removeSink?.();
  removeSink = addLogSink(createCrashLogSink({ log: logBreadcrumb, recordError }));
  reporter = candidate;
  await candidate.setEnabled(isCrashReportingActive());
}

/**
 * Saves the user's choice and applies it at once. `true` stops collection and deletes reports
 * kept on the device, so nothing captured while opted out is sent later; `false` resumes
 * collection where reporting is active and the provider started.
 */
export async function setCrashReportsOptOut(isUserOptedOut: boolean): Promise<void> {
  isOptedOut = isUserOptedOut;
  storage.setBoolean(STORAGE_KEYS.crashReportsOptOut, isUserOptedOut);
  if (isUserOptedOut) {
    await collector.setEnabled(false);
    await collector.discardPending();
    return;
  }
  await collector.setEnabled(reporter !== noopReporter && isCrashReportingActive());
}

/** Back to the not-started state; for tests. */
export function resetCrashReporting(): void {
  removeSink?.();
  removeSink = undefined;
  restoreErrorHandler?.();
  restoreErrorHandler = undefined;
  reporter = noopReporter;
  collector = noopReporter;
  isOptedOut = false;
}
