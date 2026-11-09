import { getMessaging, type Messaging } from '@react-native-firebase/messaging';

import { isFirebaseEnabled } from '@services/firebase/firebase';
import { logger } from '@services/logger/logger';

/** The messaging instance, or `undefined` (with a debug log) when Firebase is off or not configured. */
export function getPushMessaging(): Messaging | undefined {
  if (!isFirebaseEnabled()) {
    logger.debug('Push: Firebase is off or not configured, skipping');
    return undefined;
  }
  return getMessaging();
}
