import { Linking, Platform } from 'react-native';
import Toast from 'react-native-toast-message';

import { queryClient } from '@services/http/queryClient';
import { initI18nInstance } from '@services/i18n/i18n';
import { logger } from '@services/logger/logger';
import { DEFAULT_APP_CONFIG } from '@services/remote-config/appConfig';
import { APP_CONFIG_QUERY_KEY } from '@services/remote-config/remoteConfig';

import {
  buildEmailUrl,
  buildMapsUrl,
  buildPhoneUrl,
  isValidMapPoint,
  openEmail,
  openMaps,
  openPhone,
  openSettings,
  openStore,
  openUrlSafe,
} from './linking';

const toast = jest.spyOn(Toast, 'show').mockImplementation(jest.fn());
const canOpen = jest.spyOn(Linking, 'canOpenURL');
const openURL = jest.spyOn(Linking, 'openURL');
const settings = jest.spyOn(Linking, 'openSettings');

beforeAll(async () => {
  await initI18nInstance('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  canOpen.mockResolvedValue(true);
  openURL.mockResolvedValue(undefined);
  settings.mockResolvedValue(undefined);
});

describe('openUrlSafe', () => {
  test('opens supported urls', async () => {
    await expect(openUrlSafe('https://example.test')).resolves.toBe(true);

    expect(openURL).toHaveBeenCalledWith('https://example.test');
    expect(toast).not.toHaveBeenCalled();
  });

  test('toasts instead of opening unsupported urls', async () => {
    canOpen.mockResolvedValue(false);

    await expect(openUrlSafe('weird://x')).resolves.toBe(false);

    expect(openURL).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  test('swallows errors from the OS and toasts', async () => {
    openURL.mockRejectedValue(new Error('boom'));

    await expect(openUrlSafe('https://example.test')).resolves.toBe(false);

    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe('openStore', () => {
  const storeUrls = { ios: 'https://apps.example.test/i', android: 'https://play.example.test/a' };

  test.each([
    ['ios', storeUrls.ios],
    ['android', storeUrls.android],
  ] as const)('opens the %s store url from the argument', async (os, expected) => {
    jest.replaceProperty(Platform, 'OS', os);

    await openStore(storeUrls);

    expect(openURL).toHaveBeenCalledWith(expected);
  });

  test('falls back to the cached remote config', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    queryClient.setQueryData(APP_CONFIG_QUERY_KEY, { ...DEFAULT_APP_CONFIG, storeUrls });

    await openStore();

    expect(openURL).toHaveBeenCalledWith(storeUrls.android);
  });

  test('toasts when no store url is configured', async () => {
    await expect(openStore()).resolves.toBe(false);

    expect(openURL).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe('openSettings', () => {
  test('opens OS settings', async () => {
    await expect(openSettings()).resolves.toBe(true);
    expect(settings).toHaveBeenCalledTimes(1);
  });

  test('toasts when settings cannot be opened', async () => {
    settings.mockRejectedValue(new Error('no'));

    await expect(openSettings()).resolves.toBe(false);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe('buildPhoneUrl', () => {
  test.each([
    ['+20 100 123-4567', 'tel:+201001234567'],
    ['(02) 555.0101', 'tel:025550101'],
    ['*123#', 'tel:*123%23'],
    ['0100 123 4567 ext 5', 'tel:010012345675'],
  ])('%s -> %s', (input, expected) => {
    expect(buildPhoneUrl(input)).toBe(expected);
  });
});

describe('buildEmailUrl', () => {
  test('a bare address', () => {
    expect(buildEmailUrl({ to: 'ada@example.com' })).toBe('mailto:ada@example.com');
  });

  test('encodes the subject and body with %20 and reserved characters', () => {
    expect(
      buildEmailUrl({
        to: 'ada@example.com',
        subject: 'Hi there & welcome',
        body: 'Line 1\nLine 2?',
      }),
    ).toBe('mailto:ada@example.com?subject=Hi%20there%20%26%20welcome&body=Line%201%0ALine%202%3F');
  });

  test('joins several recipients and keeps only the parts that are set', () => {
    expect(buildEmailUrl({ to: [' a@x.com ', 'b+tag@x.com'], body: 'Hello' })).toBe(
      'mailto:a@x.com,b%2Btag@x.com?body=Hello',
    );
  });

  test('an empty subject is kept', () => {
    expect(buildEmailUrl({ to: 'a@x.com', subject: '' })).toBe('mailto:a@x.com?subject=');
  });
});

describe('buildMapsUrl', () => {
  const point = { lat: 30.0444, lng: 31.2357 };

  test('ios: Apple Maps link, with an optional encoded name', () => {
    expect(buildMapsUrl(point, 'ios')).toBe('https://maps.apple.com/?ll=30.0444,31.2357');
    expect(buildMapsUrl({ ...point, label: 'Café & Bar' }, 'ios')).toBe(
      'https://maps.apple.com/?ll=30.0444,31.2357&q=Caf%C3%A9%20%26%20Bar',
    );
  });

  test('android: geo intent that drops a pin, with an optional encoded name', () => {
    expect(buildMapsUrl(point, 'android')).toBe('geo:30.0444,31.2357?q=30.0444,31.2357');
    expect(buildMapsUrl({ ...point, label: 'Café & Bar' }, 'android')).toBe(
      'geo:30.0444,31.2357?q=30.0444,31.2357(Caf%C3%A9%20%26%20Bar)',
    );
  });

  test('keeps negative coordinates', () => {
    expect(buildMapsUrl({ lat: -33.8688, lng: -151.2093 }, 'android')).toBe(
      'geo:-33.8688,-151.2093?q=-33.8688,-151.2093',
    );
  });
});

describe('isValidMapPoint', () => {
  test.each([
    [{ lat: 0, lng: 0 }, true],
    [{ lat: 90, lng: -180 }, true],
    [{ lat: 91, lng: 0 }, false],
    [{ lat: 0, lng: 181 }, false],
    [{ lat: Number.NaN, lng: 0 }, false],
    [{ lat: 0, lng: Number.POSITIVE_INFINITY }, false],
  ])('%j -> %s', (point, isValid) => {
    expect(isValidMapPoint(point)).toBe(isValid);
  });
});

describe('openPhone, openEmail and openMaps', () => {
  // `Platform.select` is bound to the real platform at load time, so the test chooses the branch.
  const select = jest.spyOn(Platform, 'select');

  test('openPhone opens the tel url through openUrlSafe', async () => {
    await expect(openPhone('+20 100 123 4567')).resolves.toBe(true);

    expect(canOpen).toHaveBeenCalledWith('tel:+201001234567');
    expect(openURL).toHaveBeenCalledWith('tel:+201001234567');
  });

  test('openEmail opens the mailto url', async () => {
    await expect(openEmail({ to: 'ada@example.com', subject: 'Hi' })).resolves.toBe(true);

    expect(openURL).toHaveBeenCalledWith('mailto:ada@example.com?subject=Hi');
  });

  test.each([
    ['ios', 'https://maps.apple.com/?ll=1,2&q=Home'],
    ['android', 'geo:1,2?q=1,2(Home)'],
  ] as const)('openMaps on %s opens %s', async (os, expected) => {
    select.mockImplementation(
      (spec) => (spec as Record<string, unknown>)[os] ?? (spec as { default?: unknown }).default,
    );

    await expect(openMaps({ lat: 1, lng: 2, label: 'Home' })).resolves.toBe(true);

    expect(openURL).toHaveBeenCalledWith(expected);
  });

  test('a handler that is missing toasts and resolves false', async () => {
    canOpen.mockResolvedValue(false);

    await expect(openPhone('123')).resolves.toBe(false);

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  test('openMaps refuses an invalid coordinate without opening anything', async () => {
    await expect(openMaps({ lat: 200, lng: 0 })).resolves.toBe(false);

    expect(openURL).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe('openUrlSafe logging', () => {
  test.each([
    ['tel:+201001234567', 'tel'],
    ['mailto:ada@example.com?subject=Secret&body=Private', 'mailto'],
  ])('never logs the full %s url, only its scheme', async (url, scheme) => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
    canOpen.mockResolvedValueOnce(false);
    openURL.mockRejectedValueOnce(new Error(`Could not open URL '${url}'`));

    await openUrlSafe(url);
    canOpen.mockResolvedValueOnce(true);
    await openUrlSafe(url);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(url);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Secret');
    expect(warn.mock.calls.every((call) => call[1] === scheme)).toBe(true);
    expect(warn.mock.calls[1]).toEqual(['Failed to open url scheme', scheme, 'Error']);
    warn.mockRestore();
  });
});
