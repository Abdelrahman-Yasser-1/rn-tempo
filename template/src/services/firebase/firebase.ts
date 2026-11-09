import { getApps } from '@react-native-firebase/app';

import { ENV } from '@config/env';

/**
 * Whether the native Firebase app exists. The Firebase config files (`google-services.json`,
 * `GoogleService-Info.plist`) are per environment (`firebase/<env>/`) and copied into the build only
 * when that environment has `FIREBASE_ENABLED=true`. Without them nothing is configured.
 */
export function isFirebaseConfigured(): boolean {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

/**
 * Whether this environment uses Firebase: switched on in `.env.<env>` and the native app exists.
 * Every Firebase-backed service (push, crash reporting) must check this before it calls the SDK.
 */
export function isFirebaseEnabled(): boolean {
  return ENV.FIREBASE_ENABLED && isFirebaseConfigured();
}
