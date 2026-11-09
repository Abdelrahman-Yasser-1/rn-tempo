/* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- RNFB 27 deprecates its token and permission APIs in favour of Installation IDs and libraries (react-native-permissions, expo-notifications) that this FCM-only module deliberately does not add. This file is the only place that calls them, so the day RNFB removes them there is one file to change. */
import {
  AuthorizationStatus,
  getToken,
  hasPermission,
  onTokenRefresh,
  requestPermission,
  setAutoInitEnabled,
  type Messaging,
} from '@react-native-firebase/messaging';

/** What the iOS authorization status means for us. */
export type IosPermission = 'granted' | 'blocked' | 'undetermined';

function toIosPermission(status: number): IosPermission {
  switch (status) {
    case AuthorizationStatus.AUTHORIZED:
    case AuthorizationStatus.PROVISIONAL:
    case AuthorizationStatus.EPHEMERAL:
      return 'granted';
    case AuthorizationStatus.DENIED:
      // iOS shows the prompt once; after a "no" only the settings app can change it.
      return 'blocked';
    default:
      return 'undetermined';
  }
}

/** The current FCM token of this install. */
export function fetchFcmToken(messaging: Messaging): Promise<string> {
  return getToken(messaging);
}

/** Calls `listener` with every new token after a refresh; returns the unsubscribe function. */
export function watchFcmToken(messaging: Messaging, listener: (token: string) => void): () => void {
  return onTokenRefresh(messaging, listener);
}

/** The iOS notification permission, without asking. */
export async function readIosPermission(messaging: Messaging): Promise<IosPermission> {
  return toIosPermission(await hasPermission(messaging));
}

/** Shows the iOS permission prompt (once per install; later calls answer without a prompt). */
export async function askIosPermission(messaging: Messaging): Promise<IosPermission> {
  return toIosPermission(await requestPermission(messaging));
}

/**
 * `firebase.json` turns FCM auto-initialisation off, so nothing registers with Firebase until push is
 * on for this environment. Call it once from `initPush`; the setting is remembered by the SDK.
 */
export function enablePushAutoInit(messaging: Messaging): Promise<void> {
  return setAutoInitEnabled(messaging, true);
}
