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

  it('covers every ISO 3166-1 country with a dial code of its own', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
    for (const iso2 of ['SA', 'AE', 'EG', 'US', 'GB', 'IN', 'JP', 'DE', 'FR', 'BR', 'AU', 'CA']) {
      expect(COUNTRIES.some((country) => country.iso2 === iso2)).toBe(true);
    }
  });

  it('writes every iso2 as two upper-case letters', () => {
    for (const country of COUNTRIES) {
      expect(country.iso2).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('builds every flag from its iso2 code', () => {
    const regionalIndicator = (letter: string) =>
      String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 'A'.charCodeAt(0));
    for (const country of COUNTRIES) {
      expect(country.flag).toBe(country.iso2.split('').map(regionalIndicator).join(''));
    }
  });

  it('keeps every dial code within the ITU length and free of a leading zero', () => {
    for (const country of COUNTRIES) {
      expect(country.dialCode).toMatch(/^\+[1-9]\d{0,5}$/);
    }
  });

  it('gives every country distinct English and Arabic names without stray spaces', () => {
    const english = COUNTRIES.map((country) => country.nameEn);
    const arabic = COUNTRIES.map((country) => country.nameAr);
    expect(new Set(english).size).toBe(COUNTRIES.length);
    expect(new Set(arabic).size).toBe(COUNTRIES.length);
    for (const name of [...english, ...arabic]) {
      expect(name).toBe(name.trim());
    }
  });

  it('writes every Arabic name in Arabic script', () => {
    for (const country of COUNTRIES) {
      expect(country.nameAr).toMatch(/\p{Script=Arabic}/u);
    }
  });

  it('names a primary country for every dial code that several countries share', () => {
    const countByDialCode = new Map<string, number>();
    for (const country of COUNTRIES) {
      countByDialCode.set(country.dialCode, (countByDialCode.get(country.dialCode) ?? 0) + 1);
    }
    const shared = [...countByDialCode].filter(([, count]) => count > 1).map(([code]) => code);

    expect(shared.length).toBeGreaterThan(0);
    expect(shared.filter((code) => !(code in PRIMARY_ISO2_BY_DIAL_CODE))).toEqual([]);
  });

  it('has the well-known dial codes', () => {
    const dial = (iso2: string) => COUNTRIES.find((country) => country.iso2 === iso2)?.dialCode;
    expect(dial('AE')).toBe('+971');
    expect(dial('EG')).toBe('+20');
    expect(dial('US')).toBe('+1');
    expect(dial('GB')).toBe('+44');
    expect(dial('IN')).toBe('+91');
  });
});
