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
