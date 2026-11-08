import { useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { logger } from '@services/logger/logger';

import { askIosPermission, readIosPermission } from './fcm';
import { getPushMessaging } from './firebase';
import { syncPushToken } from './push';

/**
 * `undetermined`: never asked (or, on Android, not granted yet: Android does not say whether we
 * asked). `denied`: the user said no just now, we may ask again. `blocked`: the system will not
 * show the prompt any more, only the system settings can turn notifications on.
 */
export type PushPermissionStatus = 'granted' | 'denied' | 'blocked' | 'undetermined';

/** What asking can answer. */
export type PushPermissionResult = 'granted' | 'denied' | 'blocked';

const ANDROID_PERMISSION = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
/** Android 13 (API 33) introduced the runtime notification permission. */
const ANDROID_RUNTIME_PERMISSION_API = 33;

function needsAndroidPrompt(): boolean {
  return Platform.OS === 'android' && Platform.Version >= ANDROID_RUNTIME_PERMISSION_API;
}

/** The current notification permission, without asking. Never throws. */
export async function getPushPermission(): Promise<PushPermissionStatus> {
  try {
    if (Platform.OS === 'android') {
      if (!needsAndroidPrompt()) {
        return 'granted';
      }
      return (await PermissionsAndroid.check(ANDROID_PERMISSION)) ? 'granted' : 'undetermined';
    }
    const messaging = getPushMessaging();
    return messaging === undefined ? 'undetermined' : await readIosPermission(messaging);
  } catch (error) {
    logger.warn('Push: could not read the permission', error);
    return 'undetermined';
  }
}

async function requestAndroid(): Promise<PushPermissionResult> {
  if (!needsAndroidPrompt()) {
    return 'granted';
  }
  const result = await PermissionsAndroid.request(ANDROID_PERMISSION);
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    void syncPushToken();
    return 'granted';
  }
  return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}

async function requestIos(): Promise<PushPermissionResult> {
  const messaging = getPushMessaging();
  if (messaging === undefined) {
    return 'denied';
  }
  if ((await readIosPermission(messaging)) === 'blocked') {
    return 'blocked';
  }
  if ((await askIosPermission(messaging)) === 'granted') {
    void syncPushToken();
    return 'granted';
  }
  return 'denied';
}

/**
 * Asks for the notification permission. Call it at a meaningful moment (the user turns on
 * notifications, finishes onboarding), never at startup. Shows the system prompt only when the
 * system still allows it. Never throws.
 */
export async function requestPushPermission(): Promise<PushPermissionResult> {
  try {
    return Platform.OS === 'android' ? await requestAndroid() : await requestIos();
  } catch (error) {
    logger.warn('Push: the permission request failed', error);
    return 'denied';
  }
}

/** Notification permission for a screen: the status, `request()` and a refresh on app resume. */
export function usePushPermission() {
  const [status, setStatus] = useState<PushPermissionStatus>('undetermined');

  useEffect(() => {
    let isCurrent = true;
    const refresh = () => {
      void getPushPermission().then((next) => {
        if (isCurrent) {
          setStatus(next);
        }
        return next;
      });
    };
    refresh();
    // The user may have changed it in the system settings while the app was in the background.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => {
      isCurrent = false;
      subscription.remove();
    };
  }, []);

  const request = async () => {
    const result = await requestPushPermission();
    setStatus(result);
    return result;
  };

  return { status, request };
}
