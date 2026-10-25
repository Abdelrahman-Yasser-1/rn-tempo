import { useTranslation } from 'react-i18next';

import { changeLanguage, isRtlLanguage, type Language } from './languageManager';

/** Current language plus a setter that persists it (and restarts the app when direction changes). */
export function useLanguage() {
  const { i18n } = useTranslation();
  const language: Language = i18n.language === 'ar' ? 'ar' : 'en';
  return { language, isRtl: isRtlLanguage(language), setLanguage: changeLanguage };
}
