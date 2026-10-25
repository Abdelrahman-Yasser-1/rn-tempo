import { APP_BUNDLE_ID } from '@config/constants';

/** MMKV keys (contract C15). Renaming a shipped key needs a migration. */
export const STORAGE_KEYS = {
  theme: 'app.theme',
  language: 'app.language',
  onboardingCompleted: 'app.onboarding-completed',
  /** Non-prod only: debug-menu API base URL override, applied after a restart. */
  apiBaseUrlOverride: 'app.api-base-url-override',
  /** Prefix for Zustand persisted stores: `zustand.<store-name>`. */
  zustandPrefix: 'zustand.',
  /** Prefix for debug-menu feature flag overrides: `flags.override.<flag>`. */
  flagOverridePrefix: 'flags.override.',
} as const;

/** MMKV instance id (contract C15). */
export const STORAGE_ID = 'app-storage';

/** Keychain services (contract C15), namespaced by bundle id. */
export const KEYCHAIN_SERVICES = {
  mmkvKey: `${APP_BUNDLE_ID}.mmkv-key`,
  authTokens: `${APP_BUNDLE_ID}.auth-tokens`,
} as const;
