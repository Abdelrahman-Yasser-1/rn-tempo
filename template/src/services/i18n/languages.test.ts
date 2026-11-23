import {
  FALLBACK_LANGUAGE,
  isRtlLanguage,
  isSupportedLanguage,
  languageFromTag,
  LANGUAGES,
  SUPPORTED_LANGUAGES,
} from './languages';
import { resources } from './resources';

describe('language registry', () => {
  test('AC-L-1: lists the five languages with their native names', () => {
    expect(LANGUAGES.map(({ code, nativeName }) => [code, nativeName])).toEqual([
      ['en', 'English'],
      ['ar', 'العربية'],
      ['es', 'Español'],
      ['de', 'Deutsch'],
      ['fr', 'Français'],
    ]);
  });

  test('AC-L-2: every registered language has resources and vice versa', () => {
    expect(new Set(Object.keys(resources))).toEqual(new Set(SUPPORTED_LANGUAGES));
  });

  test('only Arabic is right-to-left', () => {
    expect(LANGUAGES.filter((language) => language.isRTL).map(({ code }) => code)).toEqual(['ar']);
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('fr')).toBe(false);
  });

  test('isSupportedLanguage accepts only registered codes', () => {
    expect(SUPPORTED_LANGUAGES.every((code) => isSupportedLanguage(code))).toBe(true);
    expect(isSupportedLanguage('it')).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });

  test.each([
    ['es-ES', 'es'],
    ['de_CH', 'de'],
    ['FR-ca', 'fr'],
    ['ar-EG', 'ar'],
    ['zh-Hans-CN', FALLBACK_LANGUAGE],
    ['', FALLBACK_LANGUAGE],
    [undefined, FALLBACK_LANGUAGE],
  ])('AC-L-3: languageFromTag(%s) is %s', (tag, expected) => {
    expect(languageFromTag(tag)).toBe(expected);
  });
});
