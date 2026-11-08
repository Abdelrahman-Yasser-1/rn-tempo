/* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- the tests drive the mocked RNFB token and permission functions that RNFB 27 deprecates; see fcm.ts */
import { getApps, type FirebaseApp } from '@react-native-firebase/app';
import { getToken, hasPermission, requestPermission } from '@react-native-firebase/messaging';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { logger } from '@services/logger/logger';

import { getPushPermission, requestPushPermission, usePushPermission } from './permission';
import { setPushTokenHandler } from './push';

type NativeStatus = Awaited<ReturnType<typeof hasPermission>>;
const APP = { name: '[DEFAULT]' } as FirebaseApp;

jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
jest.spyOn(logger, 'debug').mockImplementation(jest.fn());

const AUTHORIZED = 1;
const DENIED = 0;
const NOT_DETERMINED = -1;

function setPlatform(os: typeof Platform.OS, version: number | string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
}

const originalOs = Platform.OS;
const originalVersion = Platform.Version;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getApps).mockReturnValue([APP]);
  jest.mocked(hasPermission).mockResolvedValue(NOT_DETERMINED);
  jest.mocked(getToken).mockResolvedValue('fcm-token');
  setPushTokenHandler(undefined);
});

afterAll(() => {
  setPlatform(originalOs, originalVersion);
});

describe('push permission on iOS', () => {
  beforeEach(() => {
    setPlatform('ios', '18.0');
  });

  test.each([
    [NOT_DETERMINED, 'undetermined'],
    [DENIED, 'blocked'],
    [AUTHORIZED, 'granted'],
    [2, 'granted'],
  ])('status %i reads as %s', async (native, expected) => {
    jest.mocked(hasPermission).mockResolvedValue(native as NativeStatus);

    await expect(getPushPermission()).resolves.toBe(expected);
  });

  test('asking when undetermined shows the prompt and a yes syncs the token', async () => {
    const handler = jest.fn();
    setPushTokenHandler(handler);
    jest.mocked(requestPermission).mockResolvedValue(AUTHORIZED);

    await expect(requestPushPermission()).resolves.toBe('granted');
    await Promise.resolve();

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('fcm-token');
  });

  test('a no in the prompt is denied', async () => {
    jest.mocked(requestPermission).mockResolvedValue(DENIED);

    await expect(requestPushPermission()).resolves.toBe('denied');
  });

  test('after a refusal the prompt is not shown again: the answer is blocked', async () => {
    jest.mocked(hasPermission).mockResolvedValue(DENIED);

    await expect(requestPushPermission()).resolves.toBe('blocked');

    expect(requestPermission).not.toHaveBeenCalled();
  });

  test('without Firebase it is undetermined and asking is denied, without a prompt', async () => {
    jest.mocked(getApps).mockReturnValue([]);

    await expect(getPushPermission()).resolves.toBe('undetermined');
    await expect(requestPushPermission()).resolves.toBe('denied');

    expect(requestPermission).not.toHaveBeenCalled();
  });

  test('a native failure is denied, not a crash', async () => {
    jest.mocked(hasPermission).mockRejectedValue(new Error('native'));

    await expect(requestPushPermission()).resolves.toBe('denied');
    await expect(getPushPermission()).resolves.toBe('undetermined');
  });
});

describe('push permission on Android', () => {
  const check = jest.spyOn(PermissionsAndroid, 'check');
  const request = jest.spyOn(PermissionsAndroid, 'request');

  beforeEach(() => {
    setPlatform('android', 34);
  });

  test('before Android 13 notifications need no permission', async () => {
    setPlatform('android', 32);

    await expect(getPushPermission()).resolves.toBe('granted');
    await expect(requestPushPermission()).resolves.toBe('granted');

    expect(request).not.toHaveBeenCalled();
  });

  test('reads the POST_NOTIFICATIONS state on Android 13 and later', async () => {
    check.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(getPushPermission()).resolves.toBe('granted');
    await expect(getPushPermission()).resolves.toBe('undetermined');
    expect(check).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  });

  test.each([
    [PermissionsAndroid.RESULTS.GRANTED, 'granted'],
    [PermissionsAndroid.RESULTS.DENIED, 'denied'],
    [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN, 'blocked'],
  ])('the prompt result %s is %s', async (result, expected) => {
    request.mockResolvedValueOnce(result);

    await expect(requestPushPermission()).resolves.toBe(expected);
  });
});

describe('usePushPermission', () => {
  beforeEach(() => {
    setPlatform('ios', '18.0');
  });

  test('reads the status, updates it after request() and on app resume', async () => {
    let onChange: (state: string) => void = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onChange = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
    const { result } = await renderHook(() => usePushPermission());
    expect(result.current.status).toBe('undetermined');

    jest.mocked(requestPermission).mockResolvedValue(AUTHORIZED);
    await act(async () => {
      await result.current.request();
    });
    expect(result.current.status).toBe('granted');

    jest.mocked(hasPermission).mockResolvedValue(DENIED);
    await act(async () => {
      onChange('active');
      await Promise.resolve();
    });
    expect(result.current.status).toBe('blocked');
  });
});
