import { renderHook } from '@testing-library/react-native';

import { initStorage } from '@services/storage/storage';

import { initI18nInstance } from './i18n';
import { changeLanguage } from './languageManager';
import { useLanguage } from './useLanguage';

beforeAll(async () => {
  await initStorage();
});

describe('useLanguage', () => {
  test('reports the current language and direction', async () => {
    await initI18nInstance('ar');

    const { result } = await renderHook(() => useLanguage());

    expect(result.current).toMatchObject({ language: 'ar', isRtl: true });
    expect(result.current.setLanguage).toBe(changeLanguage);
  });

  test('defaults to en for LTR', async () => {
    await initI18nInstance('en');

    const { result } = await renderHook(() => useLanguage());

    expect(result.current).toMatchObject({ language: 'en', isRtl: false });
  });
});
