import { COUNTRIES } from '@shared/constants/countries';

import { isValidPhone, joinE164, normalizePhone, splitE164 } from './phone';

describe('normalizePhone', () => {
  it('strips spaces, dashes, dots and parentheses', () => {
    expect(normalizePhone('+1 (415) 555-0123')).toBe('+14155550123');
    expect(normalizePhone('415.555.0123')).toBe('4155550123');
  });

  it('turns a 00 international prefix into +', () => {
    expect(normalizePhone('0020 123 456 789')).toBe('+20123456789');
  });
});

describe('isValidPhone', () => {
  it('accepts E.164 numbers after normalization', () => {
    expect(isValidPhone('+1 (415) 555-0123')).toBe(true);
    expect(isValidPhone('0044 20 7946 0958')).toBe(true);
  });

  it('rejects numbers without a country code, too short, or starting with zero after +', () => {
    expect(isValidPhone('4155550123')).toBe(false);
    expect(isValidPhone('+1234')).toBe(false);
    expect(isValidPhone('+0123456789')).toBe(false);
  });
});

describe('splitE164', () => {
  it('picks the country by the longest matching dial code', () => {
    const saudi = splitE164('+966512345678');
    expect(saudi.country?.iso2).toBe('SA');
    expect(saudi.nationalNumber).toBe('512345678');
    expect(splitE164('+16841234567').country?.iso2).toBe('AS');
    expect(splitE164('+97150123456').country?.iso2).toBe('AE');
  });

  it('resolves shared dial codes to the primary country', () => {
    expect(splitE164('+14155550123').country?.iso2).toBe('US');
    expect(splitE164('+79123456789').country?.iso2).toBe('RU');
    expect(splitE164('+447911123456').country?.iso2).toBe('GB');
  });

  it('has no country without a leading + or a known dial code', () => {
    expect(splitE164('0512345678')).toEqual({ country: undefined, nationalNumber: '0512345678' });
    expect(splitE164('+999123')).toEqual({ country: undefined, nationalNumber: '999123' });
    expect(splitE164('')).toEqual({ country: undefined, nationalNumber: '' });
  });
});

describe('joinE164', () => {
  it('joins the dial code and digits, dropping the trunk zero and separators', () => {
    expect(joinE164('+966', '05 1234-5678')).toBe('+966512345678');
  });

  it('gives an empty string for an empty national number', () => {
    expect(joinE164('+966', '')).toBe('');
    expect(joinE164('+966', '0')).toBe('');
  });
});

describe('splitE164 edge cases', () => {
  it('has an empty national number for a bare dial code', () => {
    expect(splitE164('+966')).toMatchObject({ nationalNumber: '' });
    expect(splitE164('+966').country?.iso2).toBe('SA');
  });

  it('has no country for a lone plus', () => {
    expect(splitE164('+')).toEqual({ country: undefined, nationalNumber: '' });
  });

  it('ignores spaces, dashes and parentheses', () => {
    const split = splitE164('+966 (51) 234-5678');
    expect(split.country?.iso2).toBe('SA');
    expect(split.nationalNumber).toBe('512345678');
  });

  it('reads a 00 prefix as a plus', () => {
    const split = splitE164('00966512345678');
    expect(split.country?.iso2).toBe('SA');
    expect(split.nationalNumber).toBe('512345678');
  });

  it('prefers the longest dial code over a shorter one it starts with', () => {
    expect(splitE164('+1684123456').country?.iso2).toBe('AS');
    expect(splitE164('+12125550123').country?.iso2).toBe('US');
    expect(splitE164('+971501234567').country?.iso2).toBe('AE');
    expect(splitE164('+97150').nationalNumber).toBe('50');
  });

  it('resolves every shared dial code to its primary country', () => {
    expect(splitE164('+358401234567').country?.iso2).toBe('FI');
    expect(splitE164('+212612345678').country?.iso2).toBe('MA');
    expect(splitE164('+61412345678').country?.iso2).toBe('AU');
    expect(splitE164('+4791234567').country?.iso2).toBe('NO');
  });

  it('keeps the whole number when it has no plus', () => {
    expect(splitE164('966512345678')).toEqual({
      country: undefined,
      nationalNumber: '966512345678',
    });
  });

  it('gives back the dial code of every country it was joined with', () => {
    for (const country of COUNTRIES) {
      const joined = joinE164(country.dialCode, '7654321');
      expect(splitE164(joined).country?.dialCode).toBe(country.dialCode);
      expect(splitE164(joined).nationalNumber).toBe('7654321');
    }
  });
});

describe('joinE164 edge cases', () => {
  it('drops several leading zeros and all non-digits', () => {
    expect(joinE164('+20', '(0) 100-123.4567')).toBe('+201001234567');
    expect(joinE164('+20', '0001')).toBe('+201');
  });

  it('gives an empty string when nothing but separators or letters is typed', () => {
    expect(joinE164('+20', ' - ')).toBe('');
    expect(joinE164('+20', 'abc')).toBe('');
  });

  it('keeps zeros that are not leading', () => {
    expect(joinE164('+966', '505050505')).toBe('+966505050505');
  });

  it('round-trips with splitE164', () => {
    const split = splitE164('+201001234567');
    expect(joinE164(split.country?.dialCode ?? '', split.nationalNumber)).toBe('+201001234567');
  });
});
