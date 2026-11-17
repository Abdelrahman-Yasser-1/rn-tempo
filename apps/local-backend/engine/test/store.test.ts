import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { quoteIdent } from '../src/names.ts';
import { parseBackend, type Collection } from '../src/schema.ts';
import { MigrationConfirmError, MigrationError, Store, UniqueViolationError } from '../src/store.ts';
import { validateRecord } from '../src/values.ts';

const collections = (input: unknown[]): Collection[] => parseBackend({ name: 'x', collections: input }).collections;

const products = (extra: unknown[] = []): Collection[] =>
  collections([
    {
      name: 'products',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'sku', type: 'string', unique: true },
        { name: 'price', type: 'number' },
        { name: 'inStock', type: 'boolean' },
        { name: 'tags', type: 'json' },
        ...extra,
      ],
    },
  ]);

function seeded(): Store {
  const store = Store.open(':memory:');
  store.migrate(products());
  store.insert('products', { title: 'Lamp', sku: 'A1', price: 10, inStock: true, tags: ['x', { y: 1 }] });
  store.insert('products', { title: 'Desk', sku: 'B2', price: 30, inStock: false });
  store.insert('products', { title: 'Chair', sku: 'C3', price: 20 });
  return store;
}

describe('store: tables and values', () => {
  it('stores typed values and decodes them back', () => {
    const store = seeded();
    expect(store.get('products', 1)).toEqual({ id: 1, title: 'Lamp', sku: 'A1', price: 10, inStock: true, tags: ['x', { y: 1 }] });
    expect(store.get('products', 2)?.inStock).toBe(false);
    expect(store.get('products', 3)?.inStock).toBeNull();
    expect(store.get('products', 99)).toBeUndefined();
  });

  it('lists with filters, search, sort, paging and a total', () => {
    const store = seeded();
    expect(store.list('products', { sort: [{ field: 'price', desc: true }], limit: 2 })).toMatchObject({ total: 3, rows: [{ title: 'Desk' }, { title: 'Chair' }] });
    expect(store.list('products', { skip: 2, limit: 5 }).rows.map((r) => r.title)).toEqual(['Chair']);
    expect(store.list('products', { where: [{ field: 'inStock', value: 'true' }] }).rows.map((r) => r.title)).toEqual(['Lamp']);
    expect(store.list('products', { search: { fields: ['title'], text: 'ch' } }).rows.map((r) => r.title)).toEqual(['Chair']);
  });

  it('turns a duplicate into UniqueViolationError naming the field', () => {
    const store = seeded();
    expect(() => store.insert('products', { title: 'Dup', sku: 'A1' })).toThrow(UniqueViolationError);
    try {
      store.update('products', 2, { sku: 'A1' });
    } catch (error) {
      expect((error as UniqueViolationError).field).toBe('sku');
    }
  });

  it('updates and removes rows', () => {
    const store = seeded();
    expect(store.update('products', 1, { price: 11 })?.price).toBe(11);
    expect(store.update('products', 77, { price: 1 })).toBeUndefined();
    expect(store.remove('products', 1)).toBe(true);
    expect(store.remove('products', 1)).toBe(false);
    expect(store.count('products')).toBe(2);
  });

  it('never reuses an id after a delete', () => {
    const store = seeded();
    store.remove('products', 3);
    expect(store.insert('products', { title: 'New', sku: 'N' }).id).toBe(4);
  });
});

describe('store: SQL injection', () => {
  it('keeps hostile values in parameters', () => {
    const store = seeded();
    const evil = "x'); DROP TABLE products; --";
    expect(store.list('products', { where: [{ field: 'title', value: evil }] }).total).toBe(0);
    expect(store.list('products', { search: { fields: ['title'], text: evil } }).total).toBe(0);
    store.insert('products', { title: evil, sku: "o'brien" });
    expect(store.list('products', { where: [{ field: 'title', value: evil }] }).total).toBe(1);
    expect(store.count('products')).toBe(4);
  });

  it('treats % and _ in a search as plain characters', () => {
    const store = seeded();
    expect(store.list('products', { search: { fields: ['title'], text: '%' } }).total).toBe(0);
    expect(store.list('products', { search: { fields: ['title'], text: '_amp' } }).total).toBe(0);
  });

  it('refuses a column, sort or filter name that is not a defined field', () => {
    const store = seeded();
    expect(() => store.list('products', { sort: [{ field: 'title"; DROP TABLE products; --', desc: false }] })).toThrow();
    expect(() => store.list('products', { where: [{ field: 'nope', value: 1 }] })).toThrow();
    expect(() => store.list('products; DROP TABLE _meta')).toThrow();
    expect(store.count('products')).toBe(3);
  });

  it('refuses invalid identifiers before they can reach SQL', () => {
    for (const bad of ['', 'a b', 'a"b', '1a', 'A', 'a;b', 'sqlite_x', 'a'.repeat(64), "a'b", 'a--b']) {
      expect(() => quoteIdent(bad)).toThrow(/Invalid identifier/);
    }
    expect(quoteIdent('products')).toBe('"products"');
    expect(() => parseBackend({ name: 'x', collections: [{ name: 'a"; DROP TABLE _meta; --' }] })).toThrow();
  });
});

describe('store: migrations', () => {
  it('adds a column and backfills the default', () => {
    const store = seeded();
    const plan = store.migrate(products([{ name: 'status', type: 'string', default: 'new' }]));
    expect(plan.ops).toEqual([expect.objectContaining({ op: 'addField' })]);
    expect(store.get('products', 1)?.status).toBe('new');
    expect(store.insert('products', { title: 'T', sku: 'T', status: 'old' }).status).toBe('old');
  });

  it('adds a unique field with an index', () => {
    const store = seeded();
    store.migrate(products([{ name: 'code', type: 'string', unique: true }]));
    store.insert('products', { title: 'a', sku: 'a1', code: 'c' });
    expect(() => store.insert('products', { title: 'b', sku: 'b1', code: 'c' })).toThrow(UniqueViolationError);
  });

  it('refuses to drop a column without confirm and reports what would be lost', () => {
    const store = seeded();
    const smaller = collections([{ name: 'products', fields: [{ name: 'title', type: 'string', required: true }] }]);
    let caught: unknown;
    try {
      store.migrate(smaller);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MigrationConfirmError);
    const lost = (caught as MigrationConfirmError).lost;
    expect(lost).toContainEqual({ kind: 'field', collection: 'products', field: 'sku', rows: 3 });
    expect(lost).toContainEqual({ kind: 'field', collection: 'products', field: 'price', rows: 3 });
    expect(store.get('products', 1)?.sku).toBe('A1'); // nothing changed
    store.migrate(smaller, { confirm: true });
    expect(store.get('products', 1)).toEqual({ id: 1, title: 'Lamp' });
    expect(store.appliedSchema()[0]?.fields).toHaveLength(1);
  });

  it('drops a unique column (its index goes first)', () => {
    const store = seeded();
    store.migrate(collections([{ name: 'products', fields: [{ name: 'title', type: 'string' }] }]), { confirm: true });
    expect(store.count('products')).toBe(3);
  });

  it('renames a field with an explicit hint and keeps the data and the unique index', () => {
    const store = seeded();
    const next = collections([
      {
        name: 'products',
        fields: [
          { name: 'title', type: 'string', required: true },
          { name: 'code', type: 'string', unique: true },
          { name: 'price', type: 'number' },
          { name: 'inStock', type: 'boolean' },
          { name: 'tags', type: 'json' },
        ],
      },
    ]);
    const plan = store.migrate(next, { hints: { fields: [{ collection: 'products', from: 'sku', to: 'code' }] } });
    expect(plan.lost).toEqual([]);
    expect(store.get('products', 2)?.code).toBe('B2');
    expect(() => store.insert('products', { title: 'z', code: 'B2' })).toThrow(UniqueViolationError);
  });

  it('without the hint a rename is a drop plus an add and needs confirm', () => {
    const store = seeded();
    const next = products();
    next[0]?.fields.splice(1, 1, { name: 'code', type: 'string', required: false, unique: true });
    expect(() => store.migrate(next)).toThrow(MigrationConfirmError);
  });

  it('renames a collection with its rows', () => {
    const store = seeded();
    const next = parseBackend({ name: 'x', collections: [{ ...products()[0], name: 'goods' }] }).collections;
    store.migrate(next, { hints: { collections: [{ from: 'products', to: 'goods' }] } });
    expect(store.count('goods')).toBe(3);
    expect(() => store.insert('goods', { title: 'q', sku: 'A1' })).toThrow(UniqueViolationError);
    expect(() => store.count('products')).toThrow();
  });

  it('adds and drops a collection, the drop needing confirm', () => {
    const store = seeded();
    const both = [...products(), ...collections([{ name: 'tags', fields: [{ name: 'label', type: 'string' }] }])];
    expect(store.migrate(both).ops).toEqual([expect.objectContaining({ op: 'createCollection' })]);
    store.insert('tags', { label: 'a' });
    expect(() => store.migrate(products())).toThrow(MigrationConfirmError);
    try {
      store.migrate(products());
    } catch (error) {
      expect((error as MigrationConfirmError).lost).toEqual([{ kind: 'collection', collection: 'tags', rows: 1 }]);
    }
    store.migrate(products(), { confirm: true });
    expect(() => store.count('tags')).toThrow();
  });

  it('toggles unique, and rolls the whole change back when the data has duplicates', () => {
    const store = seeded();
    store.insert('products', { title: 'Same', price: 5 });
    store.insert('products', { title: 'Same', price: 6 });
    const next = products([{ name: 'extra', type: 'string' }]);
    next[0]?.fields.splice(0, 1, { name: 'title', type: 'string', required: true, unique: true });
    expect(() => store.migrate(next)).toThrow(MigrationError);
    expect(store.appliedSchema()[0]?.fields.some((field) => field.name === 'extra')).toBe(false);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('products') WHERE name = 'extra'").get()?.n).toBe(0);
  });

  it('treats a type change as drop plus add, needing confirm', () => {
    const store = seeded();
    const next = products();
    next[0]?.fields.splice(2, 1, { name: 'price', type: 'string', required: false, unique: false });
    expect(() => store.migrate(next)).toThrow(MigrationConfirmError);
  });

  it('survives reopening the database file with the same schema', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lb-store-')), 'db.sqlite');
    const first = Store.open(file);
    first.migrate(products());
    first.insert('products', { title: 'Kept' });
    first.close();
    const second = Store.open(file);
    expect(second.migrate(products()).ops).toEqual([]);
    expect(second.count('products')).toBe(1);
    second.close();
  });

  it('seeds only when a collection is first created', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'lb-store-')), 'db.sqlite');
    const target = collections([{ name: 'items', fields: [{ name: 'name', type: 'string', required: true }] }]);
    const seedRows = (): Record<string, unknown>[] => [{ id: 5, name: 'a' }, { name: 'b' }];
    const first = Store.open(file);
    first.migrate(target, { seedRows });
    expect(first.list('items').rows.map((row) => row.id)).toEqual([5, 6]);
    first.remove('items', 5);
    first.close();
    const second = Store.open(file);
    second.migrate(target, { seedRows });
    expect(second.count('items')).toBe(1);
    second.close();
  });

  it('rejects an invalid seed row and creates nothing', () => {
    const store = Store.open(':memory:');
    const target = collections([{ name: 'items', fields: [{ name: 'name', type: 'string', required: true }] }]);
    expect(() => store.migrate(target, { seedRows: () => [{ name: 3 }] })).toThrow(/seed\[0\]\.name/);
    expect(store.appliedSchema()).toEqual([]);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'items'").get()?.n).toBe(0);
  });

  it('refuses a database file that is a symlink, even a dangling one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lb-store-'));
    symlinkSync(join(dir, 'nowhere.sqlite'), join(dir, 'db.sqlite'));
    expect(() => Store.open(join(dir, 'db.sqlite'))).toThrow(/symbolic link/);
  });
});

describe('record validation', () => {
  const [collection] = collections([
    {
      name: 'things',
      fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'kind', type: 'enum', enumValues: ['a', 'b'], default: 'a' },
        { name: 'when', type: 'date' },
        { name: 'count', type: 'number' },
      ],
    },
  ]);
  const options = { unknownFields: 'reject', exists: () => true } as const;

  it('names every bad field and applies defaults', () => {
    const bad = validateRecord(collection as Collection, { name: 5, kind: 'z', when: 'tomorrow', count: 'x', extra: 1 }, { ...options, mode: 'create' });
    expect(bad.issues.map((issue) => issue.path).sort()).toEqual(['body.count', 'body.extra', 'body.kind', 'body.name', 'body.when']);
    const good = validateRecord(collection as Collection, { name: 'n' }, { ...options, mode: 'create' });
    expect(good).toMatchObject({ issues: [], values: { name: 'n', kind: 'a' } });
  });

  it('patch only validates what is sent', () => {
    expect(validateRecord(collection as Collection, { count: 2 }, { ...options, mode: 'patch' })).toMatchObject({ issues: [], values: { count: 2 } });
    expect(validateRecord(collection as Collection, { name: null }, { ...options, mode: 'patch' }).issues[0]?.path).toBe('body.name');
  });
});
