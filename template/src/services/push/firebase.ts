import { getMessaging, type Messaging } from '@react-native-firebase/messaging';

import { ENV } from '@config/env';
import { isFirebaseEnabled } from '@services/firebase/firebase';
import { logger } from '@services/logger/logger';

/**
 * Whether push is on for this environment: `PUSH_ENABLED=true` in `.env.<env>` and Firebase is on and
 * configured. When false, push does nothing at all: no listeners, no token, no permission prompt.
 */
export function isPushEnabled(): boolean {
  return ENV.PUSH_ENABLED && isFirebaseEnabled();
}

/** The messaging instance, or `undefined` (with a debug log) when push is off for this environment. */
export function getPushMessaging(): Messaging | undefined {
  if (!isPushEnabled()) {
    logger.debug('Push: off for this environment or Firebase is not configured, skipping');
    return undefined;
  }
  return getMessaging();
}
