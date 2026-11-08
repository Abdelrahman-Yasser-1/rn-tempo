/* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- the tests drive the mocked RNFB token and permission functions that RNFB 27 deprecates; see fcm.ts */
import { getApps, type FirebaseApp } from '@react-native-firebase/app';
import {
  getInitialNotification,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { Linking } from 'react-native';

import { ENV } from '@config/env';
import { logger } from '@services/logger/logger';
import { toast } from '@services/toast/toast';

import { initPush, setPushTokenHandler, stopPush, syncPushToken } from './push';
import { flushPushLinks, resetPushRouting, setPushPathValidator } from './routing';

const APP = { name: '[DEFAULT]' } as FirebaseApp;

const SECRET_TOKEN = 'fcm-token-SECRET-123';
const SECRET_TITLE = 'Order SECRET-TITLE';
const SECRET_BODY = 'Body SECRET-BODY';
const SECRET_DATA = 'SECRET-DATA-42';

const debug = jest.spyOn(logger, 'debug').mockImplementation(jest.fn());
const info = jest.spyOn(logger, 'info').mockImplementation(jest.fn());
const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
const error = jest.spyOn(logger, 'error').mockImplementation(jest.fn());
const show = jest.spyOn(toast, 'show').mockImplementation(jest.fn());
const hide = jest.spyOn(toast, 'hide').mockImplementation(jest.fn());
const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

const message = (overrides: Partial<RemoteMessage> = {}): RemoteMessage => ({
  messageId: 'm-1',
  notification: { title: SECRET_TITLE, body: SECRET_BODY },
  data: { link: 'items/5', secret: SECRET_DATA },
  ...overrides,
});

/** The listener a mocked subscribe function received (always the second argument). */
function lastListener(subscribe: unknown): unknown {
  const calls = jest.mocked(subscribe as jest.Mock).mock.calls as unknown[][];
  return calls.at(-1)?.[1];
}

const tokenListener = (subscribe: unknown) => lastListener(subscribe) as (token: string) => void;
const messageListener = (subscribe: unknown) =>
  lastListener(subscribe) as (message: RemoteMessage) => void;

function everyLoggedValue(): string {
  return JSON.stringify([debug, info, warn, error].map((spy) => spy.mock.calls));
}

beforeEach(() => {
  stopPush();
  setPushTokenHandler(undefined);
  resetPushRouting();
  setPushPathValidator((path) => path === 'items/5');
  flushPushLinks();
  jest.clearAllMocks();
  jest.mocked(getApps).mockReturnValue([APP]);
  jest.mocked(getToken).mockResolvedValue(SECRET_TOKEN);
  jest.mocked(getInitialNotification).mockResolvedValue(null);
});

describe('push when Firebase is not configured', () => {
  beforeEach(() => {
    jest.mocked(getApps).mockReturnValue([]);
  });

  test('initPush and syncPushToken do nothing and log at debug only', async () => {
    const handler = jest.fn();
    setPushTokenHandler(handler);

    await initPush();
    await syncPushToken();

    expect(onMessage).not.toHaveBeenCalled();
    expect(onTokenRefresh).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
  });

  test('a throwing getApps counts as not configured', async () => {
    jest.mocked(getApps).mockImplementation(() => {
      throw new Error('native module missing');
    });

    await expect(initPush()).resolves.toBeUndefined();

    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('push token', () => {
  test('hands the first token to the handler', async () => {
    const handler = jest.fn();
    setPushTokenHandler(handler);

    await initPush();

    expect(handler).toHaveBeenCalledWith(SECRET_TOKEN);
  });

  test('hands a refreshed token to the handler', async () => {
    const handler = jest.fn();
    setPushTokenHandler(handler);
    await initPush();

    tokenListener(onTokenRefresh)('new-token');

    expect(handler).toHaveBeenLastCalledWith('new-token');
  });

  test('the default handler logs that a token arrived but not the token', async () => {
    await initPush();
    tokenListener(onTokenRefresh)('other-SECRET-token');

    expect(debug).toHaveBeenCalledWith('Push: token received');
    expect(everyLoggedValue()).not.toContain('SECRET');
  });

  test('a failing token handler is a warning, not a crash', async () => {
    setPushTokenHandler(() => Promise.reject(new Error('backend down')));

    await expect(syncPushToken()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Push: the token handler failed', expect.any(Error));
  });

  test('a failing token fetch is a warning, not a crash', async () => {
    jest.mocked(getToken).mockRejectedValue(new Error('no network'));

    await expect(syncPushToken()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Push: could not get the token', expect.any(Error));
  });

  test('initPush twice registers the listeners once', async () => {
    await initPush();
    await initPush();

    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});

describe('foreground messages', () => {
  test('show the in-app toast with the title and body of the payload', async () => {
    await initPush();

    messageListener(onMessage)(message({ data: undefined }));

    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ title: SECRET_TITLE, description: SECRET_BODY }),
    );
    expect(show.mock.calls[0]?.[0].onPress).toBeUndefined();
  });

  test('pressing the toast of a message with a link opens it and hides the toast', async () => {
    await initPush();
    messageListener(onMessage)(message());

    show.mock.calls[0]?.[0].onPress?.();

    expect(openURL).toHaveBeenCalledWith(`${ENV.DEEP_LINK_SCHEME}://items/5`);
    expect(hide).toHaveBeenCalled();
  });

  test('a link to a foreign place gives a toast without action', async () => {
    await initPush();

    messageListener(onMessage)(message({ data: { link: 'https://evil.test' } }));

    expect(show.mock.calls[0]?.[0].onPress).toBeUndefined();
  });

  test('a data-only message shows nothing', async () => {
    await initPush();

    messageListener(onMessage)(message({ notification: undefined }));

    expect(show).not.toHaveBeenCalled();
  });
});

describe('notification presses', () => {
  test('a warm press opens the link', async () => {
    await initPush();

    messageListener(onNotificationOpenedApp)(message());

    expect(openURL).toHaveBeenCalledWith(`${ENV.DEEP_LINK_SCHEME}://items/5`);
  });

  test('a cold start from a notification opens the link once the navigator is ready', async () => {
    resetPushRouting();
    setPushPathValidator((path) => path === 'items/5');
    jest.mocked(getInitialNotification).mockResolvedValue(message());

    await initPush();
    expect(openURL).not.toHaveBeenCalled();
    flushPushLinks();

    expect(openURL).toHaveBeenCalledWith(`${ENV.DEEP_LINK_SCHEME}://items/5`);
  });

  test('a press without a link, or with a foreign one, opens nothing', async () => {
    await initPush();
    const press = messageListener(onNotificationOpenedApp);

    press(message({ data: undefined }));
    press(message({ data: { link: 'https://evil.test/items/5' } }));

    expect(openURL).not.toHaveBeenCalled();
  });

  test('a failure reading the initial notification is a warning', async () => {
    jest.mocked(getInitialNotification).mockRejectedValue(new Error('native'));

    await expect(initPush()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });
});

describe('payload privacy', () => {
  test('no logger call receives a token, title, body or data value', async () => {
    await initPush();
    tokenListener(onTokenRefresh)(SECRET_TOKEN);
    messageListener(onMessage)(message());
    messageListener(onNotificationOpenedApp)(message());
    messageListener(onNotificationOpenedApp)(
      message({ data: { link: `https://evil.test/${SECRET_DATA}`, secret: SECRET_DATA } }),
    );
    show.mock.calls[0]?.[0].onPress?.();

    const logged = everyLoggedValue();
    expect(logged).toContain('m-1');
    for (const secret of [SECRET_TOKEN, SECRET_TITLE, SECRET_BODY, SECRET_DATA, 'evil.test']) {
      expect(logged).not.toContain(secret);
    }
  });
});
