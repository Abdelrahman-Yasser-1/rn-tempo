import { isValidPhone, normalizePhone } from './phone';

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
