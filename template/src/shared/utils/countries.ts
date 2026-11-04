import { COUNTRIES, DEFAULT_COUNTRY_ISO2 } from '@shared/constants/countries';
import type { Country } from '@shared/constants/countries';

/** The name in the given language (`ar` gives the Arabic name, anything else English). */
export function countryName(country: Country, language: string): string {
  return language.startsWith('ar') ? country.nameAr : country.nameEn;
}

/** The country with this ISO 3166-1 alpha-2 code (any case), or `undefined`. */
export function findCountry(iso2: string | undefined): Country | undefined {
  const code = iso2?.toUpperCase();
  return COUNTRIES.find((country) => country.iso2 === code);
}

/** Countries sorted by their name in the given language. */
export function sortCountries(countries: readonly Country[], language: string): Country[] {
  const locale = language.startsWith('ar') ? 'ar' : 'en';
  return [...countries].sort((a, b) =>
    countryName(a, language).localeCompare(countryName(b, language), locale),
  );
}

/**
 * Countries matching `query` by name (English or Arabic), ISO code or dial code (`+966` or `966`).
 * A blank query keeps every country.
 */
export function filterCountries(countries: readonly Country[], query: string): Country[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [...countries];
  }
  const digits = needle.replace(/^\+/, '');
  const isDialQuery = /^\d+$/.test(digits);
  return countries.filter(
    (country) =>
      country.nameEn.toLowerCase().includes(needle) ||
      country.nameAr.includes(needle) ||
      country.iso2.toLowerCase() === needle ||
      (isDialQuery && country.dialCode.slice(1).startsWith(digits)),
  );
}

/** Saudi Arabia, the default country. */
export const FALLBACK_COUNTRY: Country = findCountry(DEFAULT_COUNTRY_ISO2) ?? {
  iso2: 'SA',
  dialCode: '+966',
  flag: '\u{1F1F8}\u{1F1E6}',
  nameEn: 'Saudi Arabia',
  nameAr: 'المملكة العربية السعودية',
};
