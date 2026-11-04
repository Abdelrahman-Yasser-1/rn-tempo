import { COUNTRIES } from '@shared/constants/countries';

import {
  countryName,
  FALLBACK_COUNTRY,
  filterCountries,
  findCountry,
  sortCountries,
} from './countries';

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

describe('findCountry edge cases', () => {
  it('gives undefined for an empty string and does not match a partial code', () => {
    expect(findCountry('')).toBeUndefined();
    expect(findCountry('S')).toBeUndefined();
    expect(findCountry('SAU')).toBeUndefined();
  });
});

describe('countryName edge cases', () => {
  it('treats regional Arabic tags like ar and unknown languages as English', () => {
    const egypt = findCountry('EG');
    expect(egypt && countryName(egypt, 'ar-SA')).toBe(egypt?.nameAr);
    expect(egypt && countryName(egypt, 'fr')).toBe('Egypt');
  });
});

describe('filterCountries edge cases', () => {
  it('trims the query', () => {
    expect(iso2s(filterCountries(COUNTRIES, '  saudi  '))).toEqual(['SA']);
  });

  it('matches a dial code by its prefix', () => {
    const matches = iso2s(filterCountries(COUNTRIES, '+96'));
    expect(matches).toEqual(expect.arrayContaining(['SA', 'KW', 'IQ']));
    expect(matches).not.toContain('EG');
  });

  it('does not treat digits as part of a name or the middle of a dial code', () => {
    expect(filterCountries(COUNTRIES, '66')).not.toContainEqual(
      expect.objectContaining({ iso2: 'SA' }),
    );
  });

  it('gives no countries for a lone plus or an unknown query', () => {
    expect(filterCountries(COUNTRIES, '+')).toEqual([]);
    expect(filterCountries(COUNTRIES, 'zzzz')).toEqual([]);
  });

  it('matches an ISO code only in full, so a single letter does not list every country', () => {
    const matches = iso2s(filterCountries(COUNTRIES, 'e'));
    expect(matches).toContain('EG');
    expect(matches.length).toBeLessThan(COUNTRIES.length);
    expect(iso2s(filterCountries(COUNTRIES, 'sa'))).toContain('SA');
  });

  it('matches a part of the Arabic name', () => {
    expect(iso2s(filterCountries(COUNTRIES, 'العربية'))).toContain('SA');
  });

  it('does not change the list it is given', () => {
    const copy = [...COUNTRIES];
    filterCountries(COUNTRIES, 'egy');
    expect(COUNTRIES).toEqual(copy);
  });

  it('finds every country that shares a dial code', () => {
    expect(iso2s(filterCountries(COUNTRIES, '+1'))).toEqual(expect.arrayContaining(['US', 'CA']));
  });
});

describe('sortCountries by locale', () => {
  const sample = ['EG', 'SA', 'AE', 'AF']
    .map((iso2) => findCountry(iso2))
    .filter((country) => country !== undefined);

  it('sorts English names alphabetically', () => {
    expect(iso2s(sortCountries(sample, 'en'))).toEqual(['AF', 'EG', 'SA', 'AE']);
  });

  it('sorts Arabic names by the Arabic alphabet', () => {
    const sorted = sortCountries(sample, 'ar');
    const names = sorted.map((country) => country.nameAr);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ar')));
    expect(iso2s(sorted)).not.toEqual(iso2s(sortCountries(sample, 'en')));
  });

  it('does not change the input order', () => {
    const before = iso2s(sample);
    sortCountries(sample, 'en');
    expect(iso2s(sample)).toEqual(before);
  });
});

describe('FALLBACK_COUNTRY', () => {
  it('is Saudi Arabia', () => {
    expect(FALLBACK_COUNTRY).toEqual(findCountry('SA'));
  });
});
