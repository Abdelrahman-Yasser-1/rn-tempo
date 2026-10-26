import { initI18nInstance } from '@services/i18n/i18n';
import { applyLayoutDirection, getInitialLanguage } from '@services/i18n/languageManager';

/** Bootstrap step 2: pick the language (stored, device, `en`) and start i18next. Needs storage. */
export async function initI18n(): Promise<void> {
  const language = getInitialLanguage();
  await initI18nInstance(language);
  // Takes effect on the next launch if the stored direction differs; never restarts here.
  applyLayoutDirection(language === 'ar' ? 'ar' : 'en');
}
