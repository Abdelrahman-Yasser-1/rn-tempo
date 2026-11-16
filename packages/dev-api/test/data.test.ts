import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineEndpoint, resource, type AnyDataContext, type Db } from '@rn-tempo/api-contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readFixture, resolveData, seedItems } from '../src/index.ts';

const Item = z.object({ id: z.number().int(), title: z.string(), price: z.number() });
const ctx = (over: Partial<AnyDataContext> = {}): AnyDataContext => ({
  params: {},
  query: {},
  body: undefined,
  headers: {},
  db: {} as Db,
  ...over,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tempo-fixtures-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('resolveData order', () => {
  const generated = defineEndpoint({ method: 'GET', path: '/items/:id', response: Item });

  it('generates when nothing else is set, the same way twice', async () => {
    const a = await resolveData(generated, ctx({ params: { id: '1' } }), { seed: 1, fixturesDir: dir });
    const b = await resolveData(generated, ctx({ params: { id: '1' } }), { seed: 1, fixturesDir: dir });
    expect(a).toEqual(b);
    expect(Item.safeParse(a).success).toBe(true);
  });

  it('gives different data for different params and seeds', async () => {
    const one = await resolveData(generated, ctx({ params: { id: '1' } }), { seed: 1 });
    expect(await resolveData(generated, ctx({ params: { id: '2' } }), { seed: 1 })).not.toEqual(one);
    expect(await resolveData(generated, ctx({ params: { id: '1' } }), { seed: 2 })).not.toEqual(one);
  });

  it('a fixture file beats generation', async () => {
    writeFileSync(join(dir, 'get.items.:id.json'), JSON.stringify({ id: 9, title: 'From file', price: 1 }));
    expect(await resolveData(generated, ctx(), { seed: 1, fixturesDir: dir })).toEqual({
      id: 9,
      title: 'From file',
      price: 1,
    });
  });

  it('finds a fixture whose colon was written as an underscore', async () => {
    writeFileSync(join(dir, 'get.items._id.json'), JSON.stringify({ id: 3, title: 'Win', price: 1 }));
    expect(readFixture(dir, 'get.items.:id')).toEqual({ value: { id: 3, title: 'Win', price: 1 } });
  });

  it('the endpoint data beats a fixture file', async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'get.items.:id.json'), JSON.stringify({ id: 9, title: 'From file', price: 1 }));
    const fixed = defineEndpoint({
      method: 'GET',
      path: '/items/:id',
      response: Item,
      data: () => ({ id: 1, title: 'From data', price: 2 }),
    });
    expect(await resolveData(fixed, ctx(), { seed: 1, fixturesDir: dir })).toEqual({
      id: 1,
      title: 'From data',
      price: 2,
    });
  });

  it('names the file when a fixture is not JSON', () => {
    writeFileSync(join(dir, 'get.items.:id.json'), '{ nope');
    expect(() => readFixture(dir, 'get.items.:id')).toThrow(/get\.items\.:id\.json is not valid JSON/);
  });
});

describe('seedItems', () => {
  const binding = resource('products', Item, { seed: 4 })[0]!.resource!;

  it('generates the requested count, numbering ids from 1', () => {
    const items = seedItems(binding, 1);
    expect(items.map((i) => i.id)).toEqual([1, 2, 3, 4]);
    for (const item of items) expect(Item.safeParse(item).success).toBe(true);
    expect(seedItems(binding, 1)).toEqual(items);
  });

  it('uses listed items as they are', () => {
    const listed = resource('products', Item, { seed: [{ id: 5, title: 'x', price: 1 }] })[0]!.resource!;
    expect(seedItems(listed, 1)).toEqual([{ id: 5, title: 'x', price: 1 }]);
  });
});
