import { Platform } from 'react-native';

import { storage } from '@services/storage/storage';

// Dev-only module (loaded through a guarded `require` in client.ts): the two MMKV keys live
// here, not in `STORAGE_KEYS`, so no release bundle carries them.

/** Where the app's requests go. `env` is the build's own setting (`ENV.API_BASE_URL`). */
export const API_SOURCES = ['env', 'backend'] as const;
export type ApiSource = (typeof API_SOURCES)[number];

/** MMKV key of the chosen source. Non-prod and `__DEV__` only; applies after a restart. */
export const API_SOURCE_KEY = 'app.api-source';
/** MMKV key of the URL used when the source is `backend`. */
export const BACKEND_URL_KEY = 'app.backend-url';

/** The Tempo local backend as seen from each simulator: `10.0.2.2` is the Android emulator's alias for the host. */
const DEFAULT_BACKEND_URL = {
  ios: 'https://localhost:8443',
  android: 'https://10.0.2.2:8443',
} as const;

/** The backend URL for this platform's simulator or emulator. */
export function defaultBackendUrl(): string {
  return Platform.OS === 'android' ? DEFAULT_BACKEND_URL.android : DEFAULT_BACKEND_URL.ios;
}

/** Narrows a stored or selected value to an API source. */
export function isApiSource(value: unknown): value is ApiSource {
  return API_SOURCES.some((source) => source === value);
}

/** The stored source, `env` when none is stored. Throws `StorageNotReadyError` before storage is open. */
export function readApiSource(): ApiSource {
  const stored = storage.getString(API_SOURCE_KEY);
  return isApiSource(stored) ? stored : 'env';
}

/** The stored backend URL, or the platform default. */
export function readBackendUrl(): string {
  const stored = storage.getString(BACKEND_URL_KEY);
  return stored === undefined || stored.trim() === '' ? defaultBackendUrl() : stored;
}

/** Stores the source; `env` removes the key, because it is the default. */
export function writeApiSource(source: ApiSource): void {
  if (source === 'env') {
    storage.remove(API_SOURCE_KEY);
  } else {
    storage.setString(API_SOURCE_KEY, source);
  }
}

/** Stores the URL; an empty one goes back to the platform default. */
export function writeBackendUrl(url: string): void {
  const trimmed = url.trim();
  if (trimmed === '') {
    storage.remove(BACKEND_URL_KEY);
  } else {
    storage.setString(BACKEND_URL_KEY, trimmed);
  }
}
