import { useTranslation } from 'react-i18next';

import { changeLanguage } from './languageManager';
import { FALLBACK_LANGUAGE, isRtlLanguage, isSupportedLanguage, type Language } from './languages';

/** Current language plus a setter that persists it (and restarts the app when direction changes). */
export function useLanguage() {
  const { i18n } = useTranslation();
  const language: Language = isSupportedLanguage(i18n.language) ? i18n.language : FALLBACK_LANGUAGE;
  return { language, isRtl: isRtlLanguage(language), setLanguage: changeLanguage };
}
