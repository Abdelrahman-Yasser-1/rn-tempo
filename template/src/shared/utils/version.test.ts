import { versionCompare } from './version';

describe('versionCompare', () => {
  test.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.0.0', '1.0.1', -1],
    ['1.10.0', '1.9.9', 1],
    ['2.0', '2.0.0', 0],
    ['2', '2.0.1', -1],
    ['v1.2.3', '1.2.3', 0],
    ['1.2.3-beta.1', '1.2.3', 0],
    ['1.2.3+45', '1.2.2', 1],
    ['0.0.1', '0.0.0', 1],
    ['', '0.0.0', 0],
    ['abc', '0.0.1', -1],
  ])('compares %s with %s as %i', (first, second, expected) => {
    expect(versionCompare(first, second)).toBe(expected);
  });
});
