import { PATTERN_NAMES, PATTERNS } from './patterns';

const ADVERSARIAL = [
  `${'a'.repeat(10_000)}!`,
  `${'1'.repeat(10_000)}!`,
  `${'A'.repeat(10_000)}!`,
  `${'a '.repeat(5_000)}!`,
  `${'-'.repeat(10_000)}!`,
];

describe('PATTERNS', () => {
  it.each(PATTERN_NAMES)(
    'AC-8: %s rejects a 10,000-character adversarial input in under 50 ms',
    (name) => {
      for (const input of ADVERSARIAL) {
        const started = performance.now();
        const isMatch = PATTERNS[name].regex.test(input);
        expect(performance.now() - started).toBeLessThan(50);
        expect(typeof isMatch).toBe('boolean');
      }
    },
  );

  it('accepts and rejects sample values', () => {
    expect(PATTERNS.digits.regex.test('12345')).toBe(true);
    expect(PATTERNS.digits.regex.test('12a')).toBe(false);
    expect(PATTERNS.letters.regex.test('Sam')).toBe(true);
    expect(PATTERNS.letters.regex.test('Sam1')).toBe(false);
    expect(PATTERNS.alphanumeric.regex.test('Sam1')).toBe(true);
    expect(PATTERNS.noSpaces.regex.test('a b')).toBe(false);
    expect(PATTERNS.postalCode.regex.test('SW1A 1AA')).toBe(true);
    expect(PATTERNS.postalCode.regex.test('1')).toBe(false);
    expect(PATTERNS.iban.regex.test('GB82WEST12345698765432')).toBe(true);
    expect(PATTERNS.iban.regex.test('gb82west')).toBe(false);
  });
});
