/**
 * The languages the app ships: the single registry. Adding one means a `src/locales/<code>/` folder,
 * an entry here and in `resources.ts` (see docs: features/i18n, "Adding a language").
 * `nativeName` is how the language names itself, so it is never translated.
 */
export const LANGUAGES = [
  { code: 'en', nativeName: 'English', isRTL: false },
  { code: 'ar', nativeName: 'العربية', isRTL: true },
  { code: 'es', nativeName: 'Español', isRTL: false },
  { code: 'de', nativeName: 'Deutsch', isRTL: false },
  { code: 'fr', nativeName: 'Français', isRTL: false },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

export const SUPPORTED_LANGUAGES: readonly Language[] = LANGUAGES.map((language) => language.code);

export const FALLBACK_LANGUAGE: Language = 'en';

/** Type guard for the languages the app ships. */
export function isSupportedLanguage(candidate: unknown): candidate is Language {
  return LANGUAGES.some((language) => language.code === candidate);
}

/** Whether a language is laid out right-to-left. */
export function isRtlLanguage(language: Language): boolean {
  return LANGUAGES.some((entry) => entry.code === language && entry.isRTL);
}

/** The shipped language for a BCP 47 tag such as `fr-CA` (region and script ignored), or `en`. */
export function languageFromTag(tag: string | undefined): Language {
  const primary = tag?.split(/[-_]/)[0]?.toLowerCase();
  return isSupportedLanguage(primary) ? primary : FALLBACK_LANGUAGE;
}

/** The language's own name (`Español`), for pickers and settings rows. */
export function getNativeName(language: Language): string {
  return LANGUAGES.find((entry) => entry.code === language)?.nativeName ?? language;
}
