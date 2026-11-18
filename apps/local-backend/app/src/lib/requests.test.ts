import { describe, expect, it } from 'vitest';

import type { RequestEntry } from '../api/types';

import { addEntry, bodyText, filterEntries, MAX_ENTRIES, methodsSeen, NO_FILTERS, statusClass } from './requests';

const entry = (id: number, overrides: Partial<RequestEntry> = {}): RequestEntry => ({
  id,
  at: `2026-01-01T00:00:${String(id % 60).padStart(2, '0')}.000Z`,
  method: 'GET',
  url: '/products',
  status: 200,
  ms: 3,
  req: { headers: {}, body: undefined },
  res: { body: { ok: true } },
  ...overrides,
});

describe('addEntry', () => {
  it('appends new entries and ignores one it has already seen', () => {
    const first = addEntry([], entry(1));
    expect(addEntry(first, entry(1))).toHaveLength(1);
    expect(addEntry(first, entry(2))).toHaveLength(2);
  });

  it('treats a restarted server (ids from 1 again, new time) as new entries', () => {
    const list = addEntry([], entry(1));
    expect(addEntry(list, entry(1, { at: '2026-02-01T00:00:00.000Z' }))).toHaveLength(2);
  });

  it('keeps only the newest 500', () => {
    let list: RequestEntry[] = [];
    for (let id = 1; id <= MAX_ENTRIES + 5; id += 1) list = addEntry(list, entry(id, { at: `t${id}` }));
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0]?.id).toBe(6);
  });
});

describe('filterEntries', () => {
  const list = [
    entry(1),
    entry(2, { method: 'POST', url: '/auth/login', status: 400 }),
    entry(3, { url: '/Products/9', status: 404 }),
    entry(4, { status: 503 }),
  ];

  it('returns everything without filters', () => {
    expect(filterEntries(list, NO_FILTERS)).toHaveLength(4);
  });

  it('filters by method, status class and path text together', () => {
    expect(filterEntries(list, { ...NO_FILTERS, method: 'POST' }).map((e) => e.id)).toEqual([2]);
    expect(filterEntries(list, { ...NO_FILTERS, status: '4xx' }).map((e) => e.id)).toEqual([2, 3]);
    expect(filterEntries(list, { ...NO_FILTERS, text: 'PRODUCTS' }).map((e) => e.id)).toEqual([1, 3, 4]);
    expect(filterEntries(list, { method: 'GET', status: '4xx', text: 'products' }).map((e) => e.id)).toEqual([3]);
  });
});

describe('helpers', () => {
  it('classes statuses', () => {
    expect([200, 301, 404, 500].map(statusClass)).toEqual(['2xx', '3xx', '4xx', '5xx']);
  });

  it('lists methods seen, sorted', () => {
    expect(methodsSeen([entry(1), entry(2, { method: 'POST' }), entry(3)])).toEqual(['GET', 'POST']);
  });

  it('renders bodies, marking a cut one', () => {
    expect(bodyText(undefined, undefined)).toBe('(empty)');
    expect(bodyText({ a: 1 }, undefined)).toBe('{\n  "a": 1\n}');
    expect(bodyText('{"a":1', true)).toContain('cut by the server');
  });
});
