import { APP_BUNDLE_ID } from '@config/constants';

/** MMKV keys (contract C15). Renaming a shipped key needs a migration. */
export const STORAGE_KEYS = {
  theme: 'app.theme',
  language: 'app.language',
  onboardingCompleted: 'app.onboarding-completed',
  /** Set on first launch; its absence with tokens present means a reinstall. */
  installMarker: 'app.install-marker',
  /** Non-prod only: debug-menu API base URL override, applied after a restart. */
  apiBaseUrlOverride: 'app.api-base-url-override',
  /** User opted out of crash reports (Settings); absent means shared. */
  crashReportsOptOut: 'app.crash-reports-opt-out',
  /** Prefix for Zustand persisted stores: `zustand.<store-name>`. */
  zustandPrefix: 'zustand.',
  /** Prefix for debug-menu feature flag overrides: `flags.override.<flag>`. */
  flagOverridePrefix: 'flags.override.',
  // @tempo-feature:dynamic-forms:start
  /** Prefix of saved form drafts: `forms.draft.<key>` (never sensitive or file fields). */
  formsDraftPrefix: 'forms.draft.',
  /** Names of the saved drafts, so sign-out can delete them all. */
  formsDraftIndex: 'forms.draft-index',
  // @tempo-feature:dynamic-forms:end
} as const;

/**
 * MMKV instance ids by area (contract C15). Ids are never derived from the environment: dev,
 * staging and prod are different bundle ids, so their sandboxes (and files) are already separate
 * on a device. Renaming a shipped id would orphan the user's data, so these stay stable.
 */
export const STORAGE_AREA_IDS = {
  /** Default area: settings, flags, persisted stores. Survives sign-out. */
  app: 'app-storage',
  /** Disposable data; safe to `clearAll()` on sign-out. */
  cache: 'app-cache',
} as const;

/** Keychain services (contract C15), namespaced by bundle id. */
export const KEYCHAIN_SERVICES = {
  mmkvKey: `${APP_BUNDLE_ID}.mmkv-key`,
  authTokens: `${APP_BUNDLE_ID}.auth-tokens`,
} as const;
