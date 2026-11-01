import { capitalize, initials, maskEmail, maskPhone, truncate } from './string';

describe('capitalize', () => {
  it('uppercases only the first character', () => {
    expect(capitalize('hello world')).toBe('Hello world');
    expect(capitalize('')).toBe('');
  });
});

describe('truncate', () => {
  it('leaves short values untouched', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('cuts long values and appends the suffix', () => {
    expect(truncate('a long sentence', 8)).toBe('a long …');
    expect(truncate('a long sentence', 8, '...')).toBe('a lon...');
  });
});

describe('initials', () => {
  it('takes the first letter of the first and last names', () => {
    expect(initials('ada lovelace')).toBe('AL');
    expect(initials('  Grace   Brewster Hopper ')).toBe('GH');
  });

  it('uses one letter for a single name and nothing for blank input', () => {
    expect(initials('Cher')).toBe('C');
    expect(initials('   ')).toBe('');
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('jane.doe@mail.com')).toBe('j*******@mail.com');
  });

  it('returns input without an @ unchanged', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});

describe('maskPhone', () => {
  it('keeps the last four digits and the leading plus', () => {
    expect(maskPhone('+201234567890')).toBe('+********7890');
  });

  it('returns short numbers unchanged', () => {
    expect(maskPhone('1234')).toBe('1234');
  });
});
