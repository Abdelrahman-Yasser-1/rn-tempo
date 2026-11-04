import { COUNTRIES } from '@shared/constants/countries';

import { countryName, filterCountries, findCountry, sortCountries } from './countries';

const iso2s = (countries: readonly { iso2: string }[]) => countries.map((country) => country.iso2);

describe('findCountry', () => {
  it('finds a country by ISO code in any case', () => {
    expect(findCountry('sa')?.dialCode).toBe('+966');
    expect(findCountry('SA')?.iso2).toBe('SA');
  });

  it('gives undefined for an unknown or missing code', () => {
    expect(findCountry('ZZ')).toBeUndefined();
    expect(findCountry(undefined)).toBeUndefined();
  });
});

describe('countryName', () => {
  it('uses the Arabic name for ar and English otherwise', () => {
    const saudi = findCountry('SA');
    expect(saudi && countryName(saudi, 'ar')).toBe(saudi?.nameAr);
    expect(saudi && countryName(saudi, 'en')).toBe('Saudi Arabia');
  });
});

describe('filterCountries', () => {
  it('keeps everything for a blank query', () => {
    expect(filterCountries(COUNTRIES, '  ')).toHaveLength(COUNTRIES.length);
  });

  it('matches the English name case-insensitively', () => {
    expect(iso2s(filterCountries(COUNTRIES, 'saudi'))).toEqual(['SA']);
  });

  it('matches the Arabic name', () => {
    expect(iso2s(filterCountries(COUNTRIES, 'السعودية'))).toContain('SA');
  });

  it('matches the ISO code exactly', () => {
    expect(iso2s(filterCountries(COUNTRIES, 'eg'))).toContain('EG');
  });

  it('matches the dial code with or without the plus', () => {
    expect(iso2s(filterCountries(COUNTRIES, '+966'))).toEqual(['SA']);
    expect(iso2s(filterCountries(COUNTRIES, '966'))).toEqual(['SA']);
  });
});

describe('sortCountries', () => {
  it('sorts by the localized name without changing the input', () => {
    const sorted = sortCountries(COUNTRIES, 'en');
    expect(sorted[0]?.nameEn.localeCompare(sorted[1]?.nameEn ?? '', 'en')).toBeLessThanOrEqual(0);
    expect(sorted).not.toBe(COUNTRIES);
  });
});
