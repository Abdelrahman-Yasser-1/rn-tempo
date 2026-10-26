import { Linking, Platform } from 'react-native';
import Toast from 'react-native-toast-message';

import { queryClient } from '@services/http/queryClient';
import { i18n } from '@services/i18n/i18n';
import { logger } from '@services/logger/logger';
import { DEFAULT_APP_CONFIG, type AppConfig } from '@services/remote-config/appConfig';
import { APP_CONFIG_QUERY_KEY } from '@services/remote-config/remoteConfig';

/** Tells the user a link could not be opened. WS4 (task 4.x): route through services/toast. */
function showOpenFailed(): void {
  Toast.show({ type: 'error', text1: i18n.t('linking.openFailed', { ns: 'app' }) });
}

/** Opens a URL after `canOpenURL`; never throws, and toasts when it cannot be opened. */
export async function openUrlSafe(url: string): Promise<boolean> {
  try {
    if (!(await Linking.canOpenURL(url))) {
      logger.warn('No handler for url', url);
      showOpenFailed();
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch (error) {
    logger.warn('Failed to open url', url, error);
    showOpenFailed();
    return false;
  }
}

/** Opens this platform's store page; uses the cached remote config unless `storeUrls` is passed. */
export function openStore(storeUrls?: AppConfig['storeUrls']): Promise<boolean> {
  const urls =
    storeUrls ??
    queryClient.getQueryData<AppConfig>(APP_CONFIG_QUERY_KEY)?.storeUrls ??
    DEFAULT_APP_CONFIG.storeUrls;
  const url = Platform.OS === 'ios' ? urls.ios : urls.android;
  if (url === '') {
    showOpenFailed();
    return Promise.resolve(false);
  }
  return openUrlSafe(url);
}

/** Opens the OS settings page for this app. */
export async function openSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch (error) {
    logger.warn('Failed to open settings', error);
    showOpenFailed();
    return false;
  }
}
