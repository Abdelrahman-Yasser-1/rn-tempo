/* eslint-disable @typescript-eslint/unbound-method -- asserting on jest mock functions of the restart module */
import { I18nManager } from 'react-native';
import { findBestLanguageTag } from 'react-native-localize';
import RNRestart from 'react-native-restart';

import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';

import { initI18nInstance, i18n } from './i18n';
import {
  applyLayoutDirection,
  changeLanguage,
  getInitialLanguage,
  isRtlLanguage,
} from './languageManager';

const mockDeviceLanguage = (languageTag: string | undefined) => {
  jest
    .mocked(findBestLanguageTag)
    .mockReturnValue(
      languageTag ? { languageTag, isRTL: languageTag.startsWith('ar') } : undefined,
    );
};

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

beforeEach(() => {
  storage.clearAll();
  jest.clearAllMocks();
  mockDeviceLanguage('en-US');
});

describe('getInitialLanguage', () => {
  test('AC-3: a persisted language wins over the device locale', () => {
    storage.setString(STORAGE_KEYS.language, 'ar');
    mockDeviceLanguage('en-US');

    expect(getInitialLanguage()).toBe('ar');
  });

  test('AC-3: falls back to a supported device locale (region stripped)', () => {
    mockDeviceLanguage('ar-SA');

    expect(getInitialLanguage()).toBe('ar');
  });

  test('AC-3: ignores an unsupported persisted value and falls back to the device locale', () => {
    storage.setString(STORAGE_KEYS.language, 'fr');
    mockDeviceLanguage('ar');

    expect(getInitialLanguage()).toBe('ar');
  });

  test.each([['fr-FR'], [undefined]])(
    'AC-3: unsupported device locale %s falls back to en',
    (tag) => {
      mockDeviceLanguage(tag);

      expect(getInitialLanguage()).toBe('en');
    },
  );
});

describe('changeLanguage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('AC-3: LTR to RTL persists, forces RTL and restarts', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);
    const allowRTL = jest.spyOn(I18nManager, 'allowRTL');
    const forceRTL = jest.spyOn(I18nManager, 'forceRTL');

    const didRestart = await changeLanguage('ar');

    expect(didRestart).toBe(true);
    expect(storage.getString(STORAGE_KEYS.language)).toBe('ar');
    expect(i18n.language).toBe('ar');
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
    expect(RNRestart.restart).toHaveBeenCalledTimes(1);
  });

  test('AC-3: RTL to LTR forces LTR and restarts', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    const forceRTL = jest.spyOn(I18nManager, 'forceRTL');

    const didRestart = await changeLanguage('en');

    expect(didRestart).toBe(true);
    expect(forceRTL).toHaveBeenCalledWith(false);
    expect(RNRestart.restart).toHaveBeenCalledTimes(1);
  });

  test('AC-3: switching within the same direction does not restart', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);

    const didRestart = await changeLanguage('en');

    expect(didRestart).toBe(false);
    expect(RNRestart.restart).not.toHaveBeenCalled();
  });
});

test('isRtlLanguage and applyLayoutDirection', () => {
  const forceRTL = jest.spyOn(I18nManager, 'forceRTL');

  applyLayoutDirection('ar');

  expect(isRtlLanguage('ar')).toBe(true);
  expect(isRtlLanguage('en')).toBe(false);
  expect(forceRTL).toHaveBeenCalledWith(true);
});
