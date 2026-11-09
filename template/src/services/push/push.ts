import {
  getInitialNotification,
  onMessage,
  onNotificationOpenedApp,
  type RemoteMessage,
} from '@react-native-firebase/messaging';

import { logger } from '@services/logger/logger';
import { toast } from '@services/toast/toast';

import { enablePushAutoInit, fetchFcmToken, watchFcmToken } from './fcm';
import { getPushMessaging } from './firebase';
import { openPushLink, parsePushLink } from './routing';

/** Sends the token to your backend. Set it with `setPushTokenHandler`. */
export type PushTokenHandler = (token: string) => void | Promise<void>;

const defaultTokenHandler: PushTokenHandler = () => {
  // The token is a device identifier: log that it arrived, never what it is.
  logger.debug('Push: token received');
};

let tokenHandler: PushTokenHandler = defaultTokenHandler;
let stopListening: (() => void) | undefined;

/**
 * Registers what to do with the FCM token: the first one, a new one after a refresh, and the one
 * after the user allows notifications. Typically sends it to your backend. Pass `undefined` to go
 * back to the default, which only logs that a token arrived.
 */
export function setPushTokenHandler(handler: PushTokenHandler | undefined): void {
  tokenHandler = handler ?? defaultTokenHandler;
}

async function deliverToken(token: string): Promise<void> {
  try {
    await tokenHandler(token);
  } catch (error) {
    logger.warn('Push: the token handler failed', error);
  }
}

/** Fetches the current token and hands it to the token handler. Never throws. */
export async function syncPushToken(): Promise<void> {
  const messaging = getPushMessaging();
  if (messaging === undefined) {
    return;
  }
  try {
    const token = await fetchFcmToken(messaging);
    await deliverToken(token);
  } catch (error) {
    logger.warn('Push: could not get the token', error);
  }
}

/** Opens the screen a notification points to. The payload is read, never logged. */
function routeMessage(message: Readonly<RemoteMessage>, source: 'cold' | 'warm' | 'toast'): void {
  logger.debug('Push: notification pressed', source, message.messageId);
  const path = parsePushLink(message.data);
  if (path !== null) {
    openPushLink(path);
  }
}

/** A message that arrives while the app is open is shown as an in-app toast. */
function showForeground(message: Readonly<RemoteMessage>): void {
  logger.debug('Push: message received in the foreground', message.messageId);
  const title = message.notification?.title;
  if (title === undefined || title === '') {
    // A data-only message has nothing to show.
    return;
  }
  const hasLink = parsePushLink(message.data) !== null;
  toast.show({
    type: 'info',
    title,
    description: message.notification?.body,
    isClosable: true,
    onPress: hasLink
      ? () => {
          routeMessage(message, 'toast');
          toast.hide();
        }
      : undefined,
  });
}

/**
 * Starts listening: token refresh, foreground messages and notification presses (a cold start and
 * a warm one) and turns on FCM auto-initialisation. Safe to call twice and a no-op unless push is on
 * for this environment (`PUSH_ENABLED` and Firebase). It never asks for
 * the permission: use `requestPushPermission` at a meaningful moment.
 */
export async function initPush(): Promise<void> {
  const messaging = getPushMessaging();
  if (messaging === undefined || stopListening !== undefined) {
    return;
  }
  const stopTokens = watchFcmToken(messaging, (token) => {
    void deliverToken(token);
  });
  const stopMessages = onMessage(messaging, showForeground);
  const stopOpened = onNotificationOpenedApp(messaging, (message) => {
    routeMessage(message, 'warm');
  });
  stopListening = () => {
    stopTokens();
    stopMessages();
    stopOpened();
  };

  try {
    await enablePushAutoInit(messaging);
  } catch (error) {
    logger.warn('Push: could not enable FCM auto initialisation', error);
  }
  try {
    const initial = await getInitialNotification(messaging);
    if (initial !== null) {
      routeMessage(initial, 'cold');
    }
  } catch (error) {
    logger.warn('Push: could not read the notification that opened the app', error);
  }
  await syncPushToken();
}

/** Stops the listeners; used by tests and when the module is torn down. */
export function stopPush(): void {
  stopListening?.();
  stopListening = undefined;
}
