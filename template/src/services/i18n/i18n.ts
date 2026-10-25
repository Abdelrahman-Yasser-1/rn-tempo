import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_NAMESPACE, resources } from './resources';

/** The app-wide i18next instance (also handed to `I18nextProvider`). */
export const i18n = i18next;

/** Initialises i18next with the given language. Safe to call once, after storage is ready. */
export async function initI18nInstance(language: string): Promise<void> {
  if (i18n.isInitialized) {
    await i18n.changeLanguage(language);
    return;
  }
  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: 'en',
    defaultNS: DEFAULT_NAMESPACE,
    ns: Object.keys(resources.en),
    interpolation: { escapeValue: false },
    // Resources are bundled, so initialisation can complete synchronously.
    initAsync: false,
  });
}
