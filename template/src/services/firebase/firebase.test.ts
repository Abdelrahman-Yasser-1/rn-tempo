import { getApps } from '@react-native-firebase/app';

import { ENV } from '@config/env';

import { isFirebaseConfigured, isFirebaseEnabled } from './firebase';

const APP = { name: '[DEFAULT]' } as never;

beforeEach(() => {
  jest.mocked(getApps).mockReturnValue([APP]);
});

describe('isFirebaseConfigured', () => {
  test('is true when the native app exists', () => {
    expect(isFirebaseConfigured()).toBe(true);
  });

  test('is false without a native app', () => {
    jest.mocked(getApps).mockReturnValue([]);

    expect(isFirebaseConfigured()).toBe(false);
  });

  test('is false when the native module throws', () => {
    jest.mocked(getApps).mockImplementation(() => {
      throw new Error('native');
    });

    expect(isFirebaseConfigured()).toBe(false);
  });
});

describe('isFirebaseEnabled', () => {
  test.each([
    [false, true, false],
    [true, false, false],
    [false, false, false],
    [true, true, true],
  ])('FIREBASE_ENABLED=%s with configured=%s is %s', (isFlagOn, isConfigured, isExpected) => {
    jest.replaceProperty(ENV, 'FIREBASE_ENABLED', isFlagOn);
    jest.mocked(getApps).mockReturnValue(isConfigured ? [APP] : []);

    expect(isFirebaseEnabled()).toBe(isExpected);
  });
});
