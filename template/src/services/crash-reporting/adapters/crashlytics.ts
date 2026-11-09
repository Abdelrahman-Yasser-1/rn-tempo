import {
  deleteUnsentReports,
  getCrashlytics,
  log,
  recordError,
  setAttributes,
  setCrashlyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/crashlytics';

import type {
  CrashAttributes,
  CrashContext,
  CrashReporter,
  CrashReporterProvider,
} from '@services/crash-reporting/types';
import { isFirebaseEnabled } from '@services/firebase/firebase';
import { logger } from '@services/logger/logger';

/** Runs a native call whose result nobody waits for. A failure is a warning, never a crash of the app. */
async function safely(action: string, call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch (error) {
    logger.warn(`Crashlytics: ${action} failed`, error);
  }
}

/**
 * Crashlytics through React Native Firebase. This is the only file that imports the SDK.
 * `firebase.json` keeps collection off (`crashlytics_auto_collection_enabled: false`), so nothing
 * is sent until the facade calls `setEnabled(true)`.
 */
export const crashlyticsReporter: CrashReporter = {
  /** Sets the build attributes shown on every report. Collection stays off. */
  init: async (context: CrashContext) => {
    const attributes: Record<string, string> = {
      app_env: context.appEnv,
      app_version: context.version,
      bundle_id: context.bundleId,
    };
    if (context.buildNumber !== undefined) {
      attributes.build_number = context.buildNumber;
    }
    await setAttributes(getCrashlytics(), attributes);
  },
  /** Switches collection on or off for this install. */
  setEnabled: async (isEnabled: boolean) => {
    await setCrashlyticsCollectionEnabled(getCrashlytics(), isEnabled);
  },
  /** Crashlytics keeps reports captured while collection is off; this deletes them. */
  discardPending: async () => {
    await deleteUnsentReports(getCrashlytics());
  },
  /** Sets the context as custom keys, then records the error as a non-fatal. */
  recordError: (error: Error, context?: CrashAttributes) => {
    const crashlytics = getCrashlytics();
    if (context !== undefined) {
      void safely('setAttributes', () => setAttributes(crashlytics, { ...context }));
    }
    recordError(crashlytics, error);
  },
  /** Adds a breadcrumb to the next report. */
  log: (message: string) => {
    log(getCrashlytics(), message);
  },
  /** Sets the user id; Crashlytics has no "clear", so an empty id removes the user. */
  setUser: (id: string | null) => {
    void safely('setUserId', () => setUserId(getCrashlytics(), id ?? ''));
  },
  /** Sets custom keys shown on every report. */
  setAttributes: (attributes: CrashAttributes) => {
    void safely('setAttributes', () => setAttributes(getCrashlytics(), { ...attributes }));
  },
};

/** Registry entry: Crashlytics needs a configured Firebase app (`FIREBASE_ENABLED` and the config file). */
export const crashlyticsProvider: CrashReporterProvider = {
  /** Returns the Crashlytics reporter. */
  create: () => crashlyticsReporter,
  /** Runs only where Firebase is on and configured. */
  isAvailable: isFirebaseEnabled,
};
