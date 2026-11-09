import {
  deleteUnsentReports,
  log,
  recordError,
  setAttributes,
  setCrashlyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/crashlytics';

import { logger } from '@services/logger/logger';

import { crashlyticsProvider, crashlyticsReporter } from './crashlytics';

const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());

beforeEach(() => {
  jest.clearAllMocks();
});

describe('crashlyticsReporter', () => {
  test('init sets the build attributes and never turns collection on', async () => {
    await crashlyticsReporter.init({ appEnv: 'staging', version: '1.2.3', bundleId: 'com.x.y' });

    expect(setAttributes).toHaveBeenCalledWith(expect.anything(), {
      app_env: 'staging',
      app_version: '1.2.3',
      bundle_id: 'com.x.y',
    });
    expect(setCrashlyticsCollectionEnabled).not.toHaveBeenCalled();
  });

  test('init adds the build number when the app knows it', async () => {
    await crashlyticsReporter.init({
      appEnv: 'prod',
      version: '1.0.0',
      bundleId: 'com.x.y',
      buildNumber: '42',
    });

    expect(setAttributes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ build_number: '42' }),
    );
  });

  test('setEnabled switches collection', async () => {
    await crashlyticsReporter.setEnabled(true);
    await crashlyticsReporter.setEnabled(false);

    expect(setCrashlyticsCollectionEnabled).toHaveBeenNthCalledWith(1, expect.anything(), true);
    expect(setCrashlyticsCollectionEnabled).toHaveBeenNthCalledWith(2, expect.anything(), false);
  });

  test('discardPending deletes the reports kept on the device', async () => {
    await crashlyticsReporter.discardPending();

    expect(deleteUnsentReports).toHaveBeenCalledTimes(1);
  });

  test('recordError attaches the context, then records the error', () => {
    const error = new Error('boom');

    crashlyticsReporter.recordError(error, { app_env: 'prod' });

    expect(setAttributes).toHaveBeenCalledWith(expect.anything(), { app_env: 'prod' });
    expect(recordError).toHaveBeenCalledWith(expect.anything(), error);
  });

  test('log, user and attributes go to the SDK; a null user is cleared with an empty id', () => {
    crashlyticsReporter.log('step');
    crashlyticsReporter.setUser('u-1');
    crashlyticsReporter.setUser(null);
    crashlyticsReporter.setAttributes({ plan: 'free' });

    expect(log).toHaveBeenCalledWith(expect.anything(), 'step');
    expect(setUserId).toHaveBeenNthCalledWith(1, expect.anything(), 'u-1');
    expect(setUserId).toHaveBeenNthCalledWith(2, expect.anything(), '');
    expect(setAttributes).toHaveBeenCalledWith(expect.anything(), { plan: 'free' });
  });

  test('a failing native call is a warning, not an unhandled rejection', async () => {
    jest.mocked(setUserId).mockRejectedValueOnce(new Error('native'));

    crashlyticsReporter.setUser('u-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalled();
  });
});

describe('crashlyticsProvider', () => {
  test('creates the Crashlytics reporter', () => {
    expect(crashlyticsProvider.create()).toBe(crashlyticsReporter);
  });
});
