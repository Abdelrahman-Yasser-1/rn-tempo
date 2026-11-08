import { i18n, initI18nInstance } from '@services/i18n/i18n';

const translate = i18n.t as (key: string, options?: object) => string;

// Smoke test for i18next 26 with the bundled resources: real init, translate, change language
// and fall back to `en` for a language without the key.
describe('integration: i18next', () => {
  test('initialises, translates and switches between en and ar', async () => {
    await initI18nInstance('en');

    expect(i18n.isInitialized).toBe(true);
    expect(translate('common:a11y.showPassword')).toBe('Show password');

    await i18n.changeLanguage('ar');

    expect(i18n.language).toBe('ar');
    expect(translate('common:a11y.showPassword')).toBe('إظهار كلمة المرور');
  });

  test('falls back to en for an unsupported language', async () => {
    await initI18nInstance('en');
    await i18n.changeLanguage('fr');

    expect(translate('common:a11y.showPassword')).toBe('Show password');
  });
});
