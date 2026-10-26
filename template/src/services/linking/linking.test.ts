import { Linking, Platform } from 'react-native';
import Toast from 'react-native-toast-message';

import { queryClient } from '@services/http/queryClient';
import { initI18nInstance } from '@services/i18n/i18n';
import { DEFAULT_APP_CONFIG } from '@services/remote-config/appConfig';
import { APP_CONFIG_QUERY_KEY } from '@services/remote-config/remoteConfig';

import { openSettings, openStore, openUrlSafe } from './linking';

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
