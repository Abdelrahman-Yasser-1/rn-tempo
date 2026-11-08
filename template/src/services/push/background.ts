import { setBackgroundMessageHandler } from '@react-native-firebase/messaging';

import { logger } from '@services/logger/logger';

import { getPushMessaging } from './firebase';

/**
 * Registers the handler for messages that arrive while the app is in the background or closed.
 * Call it once from `index.js`, outside any component. The OS shows the notification itself from
 * the FCM `notification` payload; this handler only runs your own work for data messages. The
 * payload is never logged.
 */
export function registerPushBackgroundHandler(): void {
  const messaging = getPushMessaging();
  if (messaging === undefined) {
    return;
  }
  setBackgroundMessageHandler(messaging, (message) => {
    logger.debug('Push: message received in the background', message.messageId);
    return Promise.resolve();
  });
}
