import { getApps } from '@react-native-firebase/app';
import { getMessaging, type Messaging } from '@react-native-firebase/messaging';

import { logger } from '@services/logger/logger';

/**
 * Whether the native Firebase app exists. The Firebase config files (`google-services.json`,
 * `GoogleService-Info.plist`) are per project and not in the repository; without them nothing is
 * configured and every push call must do nothing instead of crashing.
 */
export function isFirebaseConfigured(): boolean {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
}

/** The messaging instance, or `undefined` (with a debug log) when Firebase is not configured. */
export function getPushMessaging(): Messaging | undefined {
  if (!isFirebaseConfigured()) {
    logger.debug('Push: Firebase is not configured, skipping');
    return undefined;
  }
  return getMessaging();
}
