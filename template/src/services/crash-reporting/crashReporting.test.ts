import { ENV } from '@config/env';
import { logger } from '@services/logger/logger';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

import {
  getCrashReportsOptOut,
  initCrashReporting,
  isCrashReportingActive,
  isCrashReportingConfigured,
  logBreadcrumb,
  recordError,
  resetCrashReporting,
  setCrashAttributes,
  setCrashReportsOptOut,
  setCrashUser,
} from './crashReporting';
import type { CrashReporter } from './types';

const mockReporter: jest.Mocked<CrashReporter> = {
  init: jest.fn(),
  setEnabled: jest.fn(),
  discardPending: jest.fn(),
  recordError: jest.fn(),
  log: jest.fn(),
  setUser: jest.fn(),
  setAttributes: jest.fn(),
};
const mockProvider = { isAvailable: true };

jest.mock('./registry', () => ({
  createCrashReporter: () => mockReporter,
  isCrashReporterAvailable: () => mockProvider.isAvailable,
}));

const store = new Map<string, boolean>();

function setDev(isDev: boolean): void {
  Object.defineProperty(globalThis, '__DEV__', { value: isDev, configurable: true });
}

function configure(env: { enabled: boolean; reporter: 'none' | 'crashlytics' }): void {
  jest.replaceProperty(ENV, 'CRASH_REPORTING_ENABLED', env.enabled);
  jest.replaceProperty(ENV, 'CRASH_REPORTER', env.reporter);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReporter.init.mockResolvedValue(undefined);
  mockReporter.setEnabled.mockResolvedValue(undefined);
  mockReporter.discardPending.mockResolvedValue(undefined);
  resetCrashReporting();
  store.clear();
  mockProvider.isAvailable = true;
  setDev(false);
  jest.spyOn(storage, 'getBoolean').mockImplementation((key) => store.get(key));
  jest.spyOn(storage, 'setBoolean').mockImplementation((key, isOn) => {
    store.set(key, isOn);
  });
  jest.replaceProperty(ENV, 'APP_ENV', 'staging');
  configure({ enabled: true, reporter: 'crashlytics' });
});

afterAll(() => {
  setDev(true);
});

describe('which environments report', () => {
  test.each([
    [true, 'crashlytics', true, true],
    [false, 'crashlytics', true, false],
    [true, 'none', true, false],
    [true, 'crashlytics', false, false],
  ] as const)(
    'enabled=%s reporter=%s available=%s gives configured=%s',
    (isEnabled, reporter, isAvailable, isConfigured) => {
      configure({ enabled: isEnabled, reporter });
      mockProvider.isAvailable = isAvailable;

      expect(isCrashReportingConfigured()).toBe(isConfigured);
    },
  );

  test('a build that is not configured never starts a provider and forces collection off', async () => {
    configure({ enabled: false, reporter: 'crashlytics' });

    await initCrashReporting();
    recordError(new Error('x'));

    expect(mockReporter.init).not.toHaveBeenCalled();
    expect(mockReporter.setEnabled.mock.calls).toEqual([[false]]);
    expect(mockReporter.discardPending).toHaveBeenCalledTimes(1);
    expect(mockReporter.recordError).not.toHaveBeenCalled();
  });

  test('CRASH_REPORTER=none or an unavailable provider touches no SDK', async () => {
    configure({ enabled: true, reporter: 'none' });
    await initCrashReporting();
    configure({ enabled: true, reporter: 'crashlytics' });
    mockProvider.isAvailable = false;
    await initCrashReporting();

    expect(mockReporter.setEnabled).not.toHaveBeenCalled();
    expect(mockReporter.discardPending).not.toHaveBeenCalled();
  });
});

describe('initCrashReporting', () => {
  test('starts the provider with the build context, tags app_env and turns collection on', async () => {
    await initCrashReporting();

    expect(mockReporter.init).toHaveBeenCalledWith(
      expect.objectContaining({ appEnv: 'staging', bundleId: 'com.rntempo.app' }),
    );
    expect(mockReporter.setAttributes).toHaveBeenCalledWith({ app_env: 'staging' });
    expect(mockReporter.setEnabled.mock.calls).toEqual([[false], [true]]);
    expect(mockReporter.discardPending).not.toHaveBeenCalled();
    expect(isCrashReportingActive()).toBe(true);
  });

  test('debug builds never report: collection stays off and calls are dropped', async () => {
    setDev(true);

    await initCrashReporting();
    recordError(new Error('x'));
    logBreadcrumb('step');

    expect(mockReporter.setEnabled).not.toHaveBeenCalledWith(true);
    expect(mockReporter.discardPending).toHaveBeenCalledTimes(1);
    expect(mockReporter.recordError).not.toHaveBeenCalled();
    expect(mockReporter.log).not.toHaveBeenCalled();
  });

  test('a user who opted out is respected from the first start', async () => {
    store.set(STORAGE_KEYS.crashReportsOptOut, true);

    await initCrashReporting();
    recordError(new Error('x'));

    expect(getCrashReportsOptOut()).toBe(true);
    expect(mockReporter.setEnabled).not.toHaveBeenCalledWith(true);
    expect(mockReporter.discardPending).toHaveBeenCalledTimes(1);
    expect(mockReporter.recordError).not.toHaveBeenCalled();
  });

  test('a provider that fails to start leaves collection off and rethrows', async () => {
    mockReporter.init.mockRejectedValueOnce(new Error('sdk'));

    await expect(initCrashReporting()).rejects.toThrow('sdk');
    recordError(new Error('x'));

    expect(mockReporter.setEnabled.mock.calls).toEqual([[false]]);
    expect(mockReporter.recordError).not.toHaveBeenCalled();
  });

  test('after a failed start, opting out still reaches the SDK and opting in keeps it off', async () => {
    mockReporter.init.mockRejectedValueOnce(new Error('sdk'));
    await expect(initCrashReporting()).rejects.toThrow('sdk');

    await setCrashReportsOptOut(true);
    expect(mockReporter.discardPending).toHaveBeenCalledTimes(1);
    await setCrashReportsOptOut(false);

    expect(mockReporter.setEnabled).not.toHaveBeenCalledWith(true);
  });
});

describe('uncaught errors', () => {
  test('a started provider gets uncaught errors only through the redacting handler', async () => {
    const before = ErrorUtils.getGlobalHandler();

    await initCrashReporting();
    expect(ErrorUtils.getGlobalHandler()).not.toBe(before);

    resetCrashReporting();
    expect(ErrorUtils.getGlobalHandler()).toBe(before);
  });

  test('the redacting handler is in place before collection is switched on', async () => {
    const before = ErrorUtils.getGlobalHandler();
    let isWrappedWhenEnabled = false;
    mockReporter.setEnabled.mockImplementation((isEnabled: boolean) => {
      if (isEnabled) {
        isWrappedWhenEnabled = ErrorUtils.getGlobalHandler() !== before;
      }
      return Promise.resolve();
    });

    await initCrashReporting();

    expect(isWrappedWhenEnabled).toBe(true);
  });
});

describe('opt-out', () => {
  test('saves the choice and switches collection at once, both ways', async () => {
    await initCrashReporting();

    await setCrashReportsOptOut(true);
    expect(store.get(STORAGE_KEYS.crashReportsOptOut)).toBe(true);
    expect(mockReporter.setEnabled).toHaveBeenLastCalledWith(false);
    // Reports captured before the switch are deleted, so opting back in never uploads them.
    expect(mockReporter.discardPending).toHaveBeenCalledTimes(1);
    expect(mockReporter.setEnabled.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mockReporter.discardPending.mock.invocationCallOrder[0] ?? 0,
    );
    recordError(new Error('while opted out'));
    expect(mockReporter.recordError).not.toHaveBeenCalled();

    await setCrashReportsOptOut(false);
    expect(mockReporter.setEnabled).toHaveBeenLastCalledWith(true);
    expect(mockReporter.discardPending).toHaveBeenCalledTimes(1);
    recordError(new Error('after opting in'));
    expect(mockReporter.recordError).toHaveBeenCalledTimes(1);
  });
});

describe('what a report carries', () => {
  test('every recorded error carries app_env, and the caller cannot override it', async () => {
    await initCrashReporting();
    const error = new Error('boom');

    recordError(error, { screen: 'home', app_env: 'forged' });

    expect(mockReporter.recordError).toHaveBeenCalledWith(error, {
      screen: 'home',
      app_env: 'staging',
    });
  });

  test('nothing about the user is sent unless the app calls setCrashUser', async () => {
    await initCrashReporting();

    expect(mockReporter.setUser).not.toHaveBeenCalled();
    setCrashUser('opaque-id');
    setCrashUser(null);
    setCrashAttributes({ plan: 'free' });

    expect(mockReporter.setUser).toHaveBeenNthCalledWith(1, 'opaque-id');
    expect(mockReporter.setUser).toHaveBeenNthCalledWith(2, null);
    expect(mockReporter.setAttributes).toHaveBeenCalledWith({ plan: 'free' });
    const init = mockReporter.init.mock.calls[0]?.[0];
    expect(Object.keys(init ?? {}).sort((first, second) => first.localeCompare(second))).toEqual([
      'appEnv',
      'bundleId',
      'version',
    ]);
  });
});

describe('the log sink', () => {
  test('a warning becomes a breadcrumb', async () => {
    await initCrashReporting();

    logger.warn('Something odd', { token: 'secret-token-value' });

    expect(mockReporter.log).toHaveBeenCalledWith('warn: Something odd');
    expect(JSON.stringify(mockReporter.log.mock.calls)).not.toContain('secret-token-value');
  });

  test('an error with a bug (non-operational) is recorded as a non-fatal with app_env', async () => {
    await initCrashReporting();
    const bug = new Error('render failed');

    logger.error('Unhandled render error', bug, 'component stack');

    expect(mockReporter.recordError).toHaveBeenCalledTimes(1);
    const [recorded, context] = mockReporter.recordError.mock.calls[0] ?? [];
    expect(recorded).toMatchObject({ message: 'render failed' });
    expect(context).toEqual({ log_message: 'Unhandled render error', app_env: 'staging' });
  });

  test('an expected (operational) failure is a breadcrumb, not a report', async () => {
    await initCrashReporting();
    const expected = Object.assign(new Error('offline'), { isOperational: true });

    logger.error('Request failed', expected);

    expect(mockReporter.recordError).not.toHaveBeenCalled();
    expect(mockReporter.log).toHaveBeenCalledWith('error: Request failed');
  });

  test('secrets in the error message never reach the provider', async () => {
    await initCrashReporting();

    logger.error('Failed', new Error('call with Bearer abc.def.ghi failed'));

    const [recorded] = mockReporter.recordError.mock.calls[0] ?? [];
    expect(recorded?.message).not.toContain('abc.def.ghi');
  });

  test('info and debug are not forwarded', async () => {
    await initCrashReporting();

    logger.info('hello');
    // eslint-disable-next-line testing-library/no-debugging-utils -- the logger's debug method, not a Testing Library helper
    logger.debug('hello');

    expect(mockReporter.log).not.toHaveBeenCalled();
  });
});
