import { getApps } from '@react-native-firebase/app';

import { ENV } from '@config/env';

import { getPushMessaging, isPushEnabled } from './firebase';

const APP = { name: '[DEFAULT]' } as never;

describe('isPushEnabled', () => {
  test.each([
    [true, true, true, true],
    [false, true, true, false],
    [true, false, true, false],
    [true, true, false, false],
    [false, false, false, false],
  ])(
    'PUSH_ENABLED=%s FIREBASE_ENABLED=%s configured=%s is %s',
    (isPushOn, isFirebaseOn, isConfigured, isExpected) => {
      jest.replaceProperty(ENV, 'PUSH_ENABLED', isPushOn);
      jest.replaceProperty(ENV, 'FIREBASE_ENABLED', isFirebaseOn);
      jest.mocked(getApps).mockReturnValue(isConfigured ? [APP] : []);

      expect(isPushEnabled()).toBe(isExpected);
      expect(getPushMessaging() !== undefined).toBe(isExpected);
    },
  );
});
