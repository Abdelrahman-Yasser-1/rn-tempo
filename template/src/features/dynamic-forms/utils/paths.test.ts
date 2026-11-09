import { setPath, unsetPath } from './paths';

describe('unsetPath', () => {
  it('removes a leaf without mutating the input and drops emptied parents', () => {
    const input = { a: { b: { type: 'x' } }, c: { type: 'y' } };
    expect(unsetPath(input, 'a.b')).toEqual({ c: { type: 'y' } });
    expect(input.a.b).toEqual({ type: 'x' });
  });

  it('removes a whole subtree by a prefix', () => {
    expect(unsetPath({ items: [{ t: { type: 'x' } }], other: { type: 'y' } }, 'items')).toEqual({
      other: { type: 'y' },
    });
  });

  it('keeps array indexes and drops the array when nothing is left', () => {
    const errors = { items: [{ t: { type: 'x' } }, { t: { type: 'y' } }] };
    const result = unsetPath(errors, 'items.0.t') as { items: unknown[] };
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toEqual({ t: { type: 'y' } });
    expect(unsetPath(result, 'items.1.t')).toEqual({});
  });

  it('ignores a path that does not exist', () => {
    const input = { a: { type: 'x' } };
    expect(unsetPath(input, 'b.c')).toBe(input);
  });
});

describe('setPath', () => {
  it('sets a value, creating objects and arrays on the way', () => {
    expect(setPath({}, 'a.b', 1)).toEqual({ a: { b: 1 } });
    expect(setPath({}, 'items.0.name', 'x')).toEqual({ items: [{ name: 'x' }] });
  });

  it('does not mutate the input', () => {
    const input = { a: { b: 1 } };
    const next = setPath(input, 'a.c', 2);
    expect(input).toEqual({ a: { b: 1 } });
    expect(next).toEqual({ a: { b: 1, c: 2 } });
  });
});
