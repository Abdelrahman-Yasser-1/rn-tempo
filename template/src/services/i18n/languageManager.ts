import { I18nManager } from 'react-native';
import { findBestLanguageTag } from 'react-native-localize';
import RNRestart from 'react-native-restart';

import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

import { i18n } from './i18n';
import {
  isRtlLanguage,
  isSupportedLanguage,
  languageFromTag,
  SUPPORTED_LANGUAGES,
  type Language,
} from './languages';

export {
  FALLBACK_LANGUAGE,
  isRtlLanguage,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type Language,
} from './languages';

/** Resolution order: persisted choice, then the device locale if supported, then `en`. */
export function getInitialLanguage(): Language {
  const stored = storage.getString(STORAGE_KEYS.language);
  return isSupportedLanguage(stored)
    ? stored
    : languageFromTag(findBestLanguageTag([...SUPPORTED_LANGUAGES])?.languageTag);
}

/** Aligns the native layout direction with the language; takes effect on the next launch. */
export function applyLayoutDirection(language: Language): void {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(isRtlLanguage(language));
}

/**
 * Persists and applies a language. Only a switch between LTR and RTL needs a native restart
 * (contract C11), so callers confirm with the user first in that case; two LTR languages apply live.
 * Resolves `true` when a restart was triggered.
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
