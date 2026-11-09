import { Linking, Platform } from 'react-native';

import { queryClient } from '@services/http/queryClient';
import { i18n } from '@services/i18n/i18n';
import { logger } from '@services/logger/logger';
import { DEFAULT_APP_CONFIG, type AppConfig } from '@services/remote-config/appConfig';
import { APP_CONFIG_QUERY_KEY } from '@services/remote-config/remoteConfig';
import { toast } from '@services/toast/toast';

/** Tells the user a link could not be opened. */
function showOpenFailed(): void {
  toast.show({ type: 'error', title: i18n.t('linking.openFailed', { ns: 'app' }) });
}

/** The scheme only (`tel`, `mailto`, `https`): a full url can carry a phone number or a message. */
function schemeOf(url: string): string {
  return url.split(':')[0] ?? '';
}

/** Opens a URL after `canOpenURL`; never throws, and toasts when it cannot be opened. */
export async function openUrlSafe(url: string): Promise<boolean> {
  try {
    if (!(await Linking.canOpenURL(url))) {
      logger.warn('No handler for url scheme', schemeOf(url));
      showOpenFailed();
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch (error) {
    // Not the error itself: its message repeats the full url.
    logger.warn(
      'Failed to open url scheme',
      schemeOf(url),
      error instanceof Error ? error.name : typeof error,
    );
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

export type EmailMessage = {
  /** One address or several. */
  to: string | readonly string[];
  subject?: string;
  body?: string;
};

export type MapPoint = {
  lat: number;
  lng: number;
  /** Name shown on the pin. */
  label?: string;
};

export type MapsPlatform = 'ios' | 'android';

/** `tel:` URL; spaces, dashes, dots and brackets are dropped, `#` is encoded. */
export function buildPhoneUrl(number: string): string {
  const dialable = number.replaceAll(/[^\d+*#,;]/g, '').replaceAll('#', '%23');
  return `tel:${dialable}`;
}

/** `mailto:` URL with an encoded query (`%20` for spaces, as mail apps expect). */
export function buildEmailUrl({ to, subject, body }: Readonly<EmailMessage>): string {
  const recipients = (typeof to === 'string' ? [to] : to)
    .map((address) => encodeURIComponent(address.trim()).replaceAll('%40', '@'))
    .join(',');
  const query = [
    subject === undefined ? undefined : `subject=${encodeURIComponent(subject)}`,
    body === undefined ? undefined : `body=${encodeURIComponent(body)}`,
  ].filter((part) => part !== undefined);
  return query.length === 0 ? `mailto:${recipients}` : `mailto:${recipients}?${query.join('&')}`;
}

/** Whether a point is a real coordinate on the globe. */
export function isValidMapPoint({ lat, lng }: Readonly<MapPoint>): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/** Apple Maps link on iOS, a `geo:` intent with a pin on Android. */
export function buildMapsUrl({ lat, lng, label }: Readonly<MapPoint>, os: MapsPlatform): string {
  const coordinates = `${String(lat)},${String(lng)}`;
  const name = label === undefined ? undefined : encodeURIComponent(label);
  if (os === 'ios') {
    const url = `https://maps.apple.com/?ll=${coordinates}`;
    return name === undefined ? url : `${url}&q=${name}`;
  }
  const url = `geo:${coordinates}?q=${coordinates}`;
  return name === undefined ? url : `${url}(${name})`;
}

/** Starts a phone call dialog for a number. */
export function openPhone(number: string): Promise<boolean> {
  return openUrlSafe(buildPhoneUrl(number));
}

/** Opens the mail app with a new message. */
export function openEmail(message: Readonly<EmailMessage>): Promise<boolean> {
  return openUrlSafe(buildEmailUrl(message));
}

/** Opens the maps app on a point. An invalid coordinate is refused like an unopenable link. */
export function openMaps(point: Readonly<MapPoint>): Promise<boolean> {
  if (!isValidMapPoint(point)) {
    logger.warn('Invalid map coordinates', point.lat, point.lng);
    showOpenFailed();
    return Promise.resolve(false);
  }
  const os = Platform.select<MapsPlatform>({ ios: 'ios', default: 'android' });
  return openUrlSafe(buildMapsUrl(point, os));
}
