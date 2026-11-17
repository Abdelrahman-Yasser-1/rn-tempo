import { describe, expect, it } from 'vitest';

import { cellText, columnsOf, filterRows } from './data';

describe('columnsOf', () => {
  it('puts id first, keeps first-seen order and caps at 8', () => {
    expect(columnsOf([{ name: 'a', id: 1 }, { extra: true }])).toEqual(['id', 'name', 'extra']);
    const wide = Object.fromEntries(Array.from({ length: 12 }, (_v, i) => [`c${i}`, i]));
    expect(columnsOf([wide])).toHaveLength(8);
    expect(columnsOf([])).toEqual([]);
  });
});

describe('cellText', () => {
  it('shows scalars, compact JSON and cuts long text', () => {
    expect(cellText(5)).toBe('5');
    expect(cellText(null)).toBe('');
    expect(cellText({ a: [1] })).toBe('{"a":[1]}');
    expect(cellText('x'.repeat(200))).toHaveLength(80);
  });
});

describe('filterRows', () => {
  const rows = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }];
  it('matches any value, case-insensitively', () => {
    expect(filterRows(rows, 'ADA')).toEqual([rows[0]]);
    expect(filterRows(rows, '')).toHaveLength(2);
    expect(filterRows(rows, 'zzz')).toEqual([]);
  });
});
