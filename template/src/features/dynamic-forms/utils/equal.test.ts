import { isEqual } from './equal';

describe('isEqual', () => {
  it('compares primitives, arrays and plain objects structurally', () => {
    expect(isEqual('a', 'a')).toBe(true);
    expect(isEqual(1, 2)).toBe(false);
    expect(isEqual([1, { a: 'x' }], [1, { a: 'x' }])).toBe(true);
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(isEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(isEqual({ a: undefined }, { b: undefined })).toBe(false);
    expect(isEqual(null, {})).toBe(false);
    expect(isEqual(Number.NaN, Number.NaN)).toBe(true);
  });
});
