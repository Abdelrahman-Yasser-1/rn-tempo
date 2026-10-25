import { I18nManager } from 'react-native';
import { findBestLanguageTag } from 'react-native-localize';
import RNRestart from 'react-native-restart';

import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

import { i18n } from './i18n';

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: Language = 'en';

const RTL_LANGUAGES: readonly Language[] = ['ar'];

/** Type guard for the languages the app ships. */
export function isSupportedLanguage(candidate: unknown): candidate is Language {
  return SUPPORTED_LANGUAGES.some((language) => language === candidate);
}

/** Whether a language is laid out right-to-left. */
export function isRtlLanguage(language: Language): boolean {
  return RTL_LANGUAGES.includes(language);
}

/** Resolution order: persisted choice, then the device locale if supported, then `en`. */
export function getInitialLanguage(): Language {
  const stored = storage.getString(STORAGE_KEYS.language);
  if (isSupportedLanguage(stored)) {
    return stored;
  }
  const deviceTag = findBestLanguageTag([...SUPPORTED_LANGUAGES])?.languageTag;
  const deviceLanguage = deviceTag?.split('-')[0];
  return isSupportedLanguage(deviceLanguage) ? deviceLanguage : FALLBACK_LANGUAGE;
}

/** Aligns the native layout direction with the language; takes effect on the next launch. */
export function applyLayoutDirection(language: Language): void {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(isRtlLanguage(language));
}

/**
 * Persists and applies a language. Switching between LTR and RTL needs a native restart
 * (contract C11), so callers should confirm with the user first. Resolves `true` when a restart was triggered.
 */
export async function changeLanguage(language: Language): Promise<boolean> {
  storage.setString(STORAGE_KEYS.language, language);
  await i18n.changeLanguage(language);

  const isDirectionChange = I18nManager.isRTL !== isRtlLanguage(language);
  applyLayoutDirection(language);
  if (isDirectionChange) {
    RNRestart.restart();
  }
  return isDirectionChange;
}
