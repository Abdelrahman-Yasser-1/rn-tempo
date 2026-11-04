import { COUNTRIES, DEFAULT_COUNTRY_ISO2, PRIMARY_ISO2_BY_DIAL_CODE } from './countries';

describe('COUNTRIES', () => {
  it('has unique iso2 codes', () => {
    expect(new Set(COUNTRIES.map((country) => country.iso2)).size).toBe(COUNTRIES.length);
  });

  it('writes every dial code as + followed by digits', () => {
    for (const country of COUNTRIES) {
      expect(country.dialCode).toMatch(/^\+\d+$/);
    }
  });

  it('names every country in English and Arabic and gives it a flag', () => {
    for (const country of COUNTRIES) {
      expect(country.nameEn).not.toBe('');
      expect(country.nameAr).not.toBe('');
      expect(country.flag).toMatch(/^[\u{1F1E6}-\u{1F1FF}]{2}$/u);
    }
  });

  it('maps SA to +966', () => {
    expect(COUNTRIES.find((country) => country.iso2 === 'SA')?.dialCode).toBe('+966');
    expect(DEFAULT_COUNTRY_ISO2).toBe('SA');
  });

  it('only names existing countries as primary for a dial code', () => {
    for (const [dialCode, iso2] of Object.entries(PRIMARY_ISO2_BY_DIAL_CODE)) {
      expect(COUNTRIES.find((country) => country.iso2 === iso2)?.dialCode).toBe(dialCode);
    }
  });
});
