import { afterEach, describe, expect, it } from 'vitest';

import { startBackend } from '../src/app.ts';
import { crudEndpoints } from '../src/folder.ts';
import type { BackendInput } from '../src/schema.ts';

import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const seed = Array.from({ length: 40 }, (_, i) => ({
  title: `Product ${String(i + 1).padStart(2, '0')}`,
  description: i % 2 === 0 ? 'A fine phone' : 'A fine lamp',
  price: 10 + i,
  category: i < 20 ? 'phones' : 'home',
  secret: `internal-${i}`,
}));

const definition = (endpointOverrides: Record<string, unknown> = {}): BackendInput => ({
  name: 'shop',
  collections: [
    {
      name: 'products',
      fields: [
        { name: 'title', type: 'string', required: true, unique: true },
        { name: 'description', type: 'string' },
        { name: 'price', type: 'number', required: true },
        { name: 'category', type: 'string' },
        { name: 'rating', type: 'number', default: 0 },
        { name: 'secret', type: 'string' },
      ],
      seed,
    },
  ],
  endpoints: crudEndpoints('products', { basePath: '/products', addAlias: true }).map((endpoint) => ({
    ...endpoint,
    hiddenFields: ['secret'],
    ...endpointOverrides,
  })) as BackendInput['endpoints'],
});

const post = (url: string, body: unknown, method = 'POST'): Promise<Response> =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('crud list (C13 dummyjson shapes)', () => {
  it('returns { products, total, skip, limit } with limit/skip', async () => {
    const { url } = await serve(definition());
    const body = await json(await fetch(`${url}/products?limit=5&skip=10`));
    expect(body).toMatchObject({ total: 40, skip: 10, limit: 5 });
    expect((body.products as { title: string }[]).map((p) => p.title)).toEqual(['Product 11', 'Product 12', 'Product 13', 'Product 14', 'Product 15']);
  });

  it('defaults to 30 and limit=0 returns everything', async () => {
    const { url } = await serve(definition());
    expect(((await json(await fetch(`${url}/products`))).products as unknown[]).length).toBe(30);
    const all = await json(await fetch(`${url}/products?limit=0`));
    expect((all.products as unknown[]).length).toBe(40);
  });

  it('supports page and pageSize with the paged shape', async () => {
    const { url } = await serve(definition({ listShape: 'paged' }));
    const body = await json(await fetch(`${url}/products?page=2&pageSize=15`));
    expect(body).toMatchObject({ total: 40, page: 2, pageSize: 15 });
    expect((body.items as { title: string }[])[0]?.title).toBe('Product 16');
  });

  it('sorts with sort=field and -field, and with dummyjson sortBy/order', async () => {
    const { url } = await serve(definition());
    const titles = async (query: string): Promise<string[]> =>
      ((await json(await fetch(`${url}/products?${query}&limit=3`))).products as { title: string }[]).map((p) => p.title);
    expect(await titles('sort=-price')).toEqual(['Product 40', 'Product 39', 'Product 38']);
    expect(await titles('sort=price')).toEqual(['Product 01', 'Product 02', 'Product 03']);
    expect(await titles('sortBy=price&order=desc')).toEqual(['Product 40', 'Product 39', 'Product 38']);
  });

  it('filters by equality and searches with q (also on /products/search)', async () => {
    const { url } = await serve(definition());
    expect((await json(await fetch(`${url}/products?category=home&limit=0`))).total).toBe(20);
    expect((await json(await fetch(`${url}/products?category=home&price=45`))).total).toBe(1);
    expect((await json(await fetch(`${url}/products/search?q=LAMP&limit=0`))).total).toBe(20);
    expect((await json(await fetch(`${url}/products/search?q=Product 07`))).total).toBe(1);
  });

  it('answers 400 problem+json naming a bad query parameter', async () => {
    const { url } = await serve(definition());
    for (const [query, path] of [['limit=abc', 'query.limit'], ['price=cheap', 'query.price'], ['sort=nope', 'query.sort'], ['page=0', 'query.page']]) {
      const response = await fetch(`${url}/products?${query}`);
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/problem+json');
      expect(((await json(response)).errors as { path: string }[])[0]?.path).toBe(path);
    }
  });

  it('hides hiddenFields in every response and ignores them in filters, sort and search', async () => {
    const { url } = await serve(definition());
    const list = await json(await fetch(`${url}/products?limit=1`));
    expect((list.products as object[])[0]).not.toHaveProperty('secret');
    expect(await json(await fetch(`${url}/products/1`))).not.toHaveProperty('secret');
    expect((await json(await fetch(`${url}/products?secret=internal-3`))).total).toBe(40);
    expect((await json(await fetch(`${url}/products?q=internal`))).total).toBe(0);
    expect((await fetch(`${url}/products?sort=secret`)).status).toBe(400);
  });
});

describe('crud get / create / update / delete', () => {
  it('AC-LB-3: a record added over the API is returned immediately and by get', async () => {
    const { url } = await serve(definition());
    const created = await post(`${url}/products/add`, { title: 'New phone', price: 99 });
    expect(created.status).toBe(201);
    const body = await json(created);
    expect(body).toMatchObject({ id: 41, title: 'New phone', price: 99, rating: 0 });
    expect(await json(await fetch(`${url}/products/41`))).toMatchObject({ title: 'New phone' });
    expect((await json(await fetch(`${url}/products?limit=0`))).total).toBe(41);
    expect((await post(`${url}/products`, { title: 'Second', price: 1 })).status).toBe(201);
  });

  it('AC-LB-3: records survive stopping and starting the engine', async () => {
    const { url, dir, backend } = await serve(definition());
    await post(`${url}/products`, { title: 'Persisted', price: 5 });
    await fetch(`${url}/products/1`, { method: 'DELETE' });
    await backend.stop();
    const again = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false });
    const base = `http://127.0.0.1:${again.port}`;
    try {
      expect(await json(await fetch(`${base}/products/41`))).toMatchObject({ title: 'Persisted' });
      expect((await fetch(`${base}/products/1`)).status).toBe(404);
      expect((await json(await fetch(`${base}/products?limit=0`))).total).toBe(40); // the seed is not inserted again
    } finally {
      await again.stop();
    }
  });

  it('PUT replaces and PATCH merges', async () => {
    const { url } = await serve(definition());
    const patched = await json(await post(`${url}/products/3`, { price: 1 }, 'PATCH'));
    expect(patched).toMatchObject({ id: 3, title: 'Product 03', price: 1, category: 'phones' });
    const replaced = await json(await post(`${url}/products/3`, { title: 'Replaced', price: 2 }, 'PUT'));
    expect(replaced).toMatchObject({ id: 3, title: 'Replaced', price: 2, category: null, rating: 0 });
    expect((await post(`${url}/products/999`, { price: 1 }, 'PATCH')).status).toBe(404);
  });

  it('delete returns the record with isDeleted and deletedOn, configurable', async () => {
    const { url } = await serve(definition());
    const deleted = await json(await fetch(`${url}/products/2`, { method: 'DELETE' }));
    expect(deleted).toMatchObject({ id: 2, title: 'Product 02', isDeleted: true });
    expect(typeof deleted.deletedOn).toBe('string');
    expect((await fetch(`${url}/products/2`)).status).toBe(404);
    expect((await fetch(`${url}/products/2`, { method: 'DELETE' })).status).toBe(404);
    await stopAll();
    const plain = await serve(definition({ deleteMarkers: false }));
    const body = await json(await fetch(`${plain.url}/products/2`, { method: 'DELETE' }));
    expect(body).not.toHaveProperty('isDeleted');
  });

  it('validates against the field definitions: 400 problem+json naming each field', async () => {
    const { url } = await serve(definition());
    const response = await post(`${url}/products`, { title: 5, price: 'free', bogus: 1 });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    const body = await json(response);
    expect((body.errors as { path: string }[]).map((e) => e.path).sort()).toEqual(['body.bogus', 'body.price', 'body.title']);
    expect(body.message).toBe(body.detail);
    expect((await post(`${url}/products`, { price: 1 })).status).toBe(400);
    const notJson = await fetch(`${url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    expect(notJson.status).toBe(400);
  });

  it('can strip unknown fields instead of rejecting them', async () => {
    const { url } = await serve(definition({ unknownFields: 'strip' }));
    const created = await json(await post(`${url}/products`, { title: 'S', price: 1, bogus: 1 }));
    expect(created).not.toHaveProperty('bogus');
  });

  it('answers 409 on a unique violation, naming the field', async () => {
    const { url } = await serve(definition());
    const response = await post(`${url}/products`, { title: 'Product 01', price: 1 });
    expect(response.status).toBe(409);
    expect(((await json(response)).errors as { path: string }[])[0]?.path).toBe('body.title');
    expect((await post(`${url}/products/2`, { title: 'Product 01' }, 'PATCH')).status).toBe(409);
  });

  it('answers 404 for an unknown path and 405 with Allow for a wrong method', async () => {
    const { url } = await serve(definition());
    expect((await fetch(`${url}/nothing`)).status).toBe(404);
    const wrong = await fetch(`${url}/products/search`, { method: 'POST' });
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toContain('GET');
    expect((await fetch(`${url}/products/abc`)).status).toBe(404);
  });

  it('validates relation fields against the target collection', async () => {
    const { url } = await serve({
      name: 'rel',
      collections: [
        { name: 'authors', fields: [{ name: 'name', type: 'string' }], seed: [{ name: 'Ann' }] },
        { name: 'books', fields: [{ name: 'author', type: 'relation', relationTo: 'authors' }, { name: 'meta', type: 'json' }, { name: 'on', type: 'date' }] },
      ],
      endpoints: crudEndpoints('books', { basePath: '/books' }),
    });
    expect((await post(`${url}/books`, { author: 1, meta: { a: [1] }, on: '2026-11-17' })).status).toBe(201);
    expect((await json(await fetch(`${url}/books/1`))).meta).toEqual({ a: [1] });
    expect((await post(`${url}/books`, { author: 9 })).status).toBe(400);
    expect((await post(`${url}/books`, { on: 'later' })).status).toBe(400);
  });

  it('applies the base path and answers 501 for types coming in Y2', async () => {
    const { url } = await serve({
      ...definition(),
      basePath: '/api/v1',
      endpoints: [...(definition().endpoints ?? []), { id: 'login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' }],
    });
    expect((await fetch(`${url}/api/v1/products/1`)).status).toBe(200);
    expect((await fetch(`${url}/products/1`)).status).toBe(404);
    const login = await post(`${url}/api/v1/auth/login`, {});
    expect(login.status).toBe(501);
  });
});
