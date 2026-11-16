import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ApiError,
  defineConfig,
  defineEndpoint,
  endpointId,
  isApiError,
  mountedPath,
  resource,
  validateRequest,
  validateResponse,
  type Collection,
  type Db,
} from '../src/index.ts';

const Item = z.object({ id: z.number(), title: z.string(), price: z.number() });

/** A tiny in-memory Db so resource data functions can run without a server. */
function memoryDb(rows: Record<string, unknown>[]): Db {
  const store = [...rows];
  const collection: Collection = {
    list: <T,>() => store as T[],
    get: <T,>(id: string | number) => store.find((r) => String(r.id) === String(id)) as T | undefined,
    create: <T,>(item: Record<string, unknown>) => {
      const row = { id: store.length + 1, ...item };
      store.push(row);
      return row as T;
    },
    update: <T,>(id: string | number, patch: Record<string, unknown>) => {
      const row = store.find((r) => String(r.id) === String(id));
      return row === undefined ? undefined : (Object.assign(row, patch) as T);
    },
    remove: <T,>(id: string | number) => {
      const index = store.findIndex((r) => String(r.id) === String(id));
      return index < 0 ? undefined : (store.splice(index, 1)[0] as T);
    },
  };
  return { collection: () => collection };
}

describe('endpointId', () => {
  it('normalizes method and path', () => {
    expect(endpointId('GET', '/products/:id')).toBe('get.products.:id');
    expect(endpointId('POST', '/auth/login/')).toBe('post.auth.login');
  });

  it('can be set explicitly', () => {
    const endpoint = defineEndpoint({ id: 'login', method: 'POST', path: '/auth/login', response: z.object({}) });
    expect(endpoint.id).toBe('login');
  });
});

describe('validateRequest', () => {
  const endpoint = defineEndpoint({
    method: 'POST',
    path: '/items/:id',
    params: z.object({ id: z.coerce.number() }),
    query: z.object({ limit: z.coerce.number().int().default(10) }),
    body: z.object({ title: z.string().min(2), tags: z.array(z.string()) }),
    response: Item,
  });

  it('parses and coerces valid input', () => {
    const result = validateRequest(endpoint, {
      params: { id: '7' },
      query: {},
      body: { title: 'ok', tags: ['a'] },
    });
    expect(result).toEqual({
      ok: true,
      value: { params: { id: 7 }, query: { limit: 10 }, body: { title: 'ok', tags: ['a'] } },
    });
  });

  it('reports field-level issues from every part in RFC 9457 shape', () => {
    const result = validateRequest(endpoint, {
      params: { id: 'abc' },
      query: { limit: '1.5' },
      body: { title: 'x', tags: [1] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toMatchObject({ type: 'about:blank', title: 'Invalid request', status: 400 });
    const paths = (result.problem.errors ?? []).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['params.id', 'query.limit', 'body.title', 'body.tags[0]']));
    for (const error of result.problem.errors ?? []) expect(error.message).toEqual(expect.any(String));
  });

  it('passes parts without a schema through', () => {
    const open = defineEndpoint({ method: 'GET', path: '/x', response: z.object({}) });
    const result = validateRequest(open, { params: { a: '1' }, query: { b: '2' }, body: undefined });
    expect(result).toMatchObject({ ok: true, value: { params: { a: '1' }, query: { b: '2' } } });
  });
});

describe('validateResponse', () => {
  const endpoint = defineEndpoint({ method: 'GET', path: '/x', response: Item });
  it('accepts a matching value and names the bad field otherwise', () => {
    expect(validateResponse(endpoint, { id: 1, title: 't', price: 2 }).ok).toBe(true);
    const bad = validateResponse(endpoint, { id: 1, title: 't', price: 'free' });
    expect(bad).toMatchObject({ ok: false, issues: [{ path: 'response.price' }] });
  });
});

describe('isApiError', () => {
  it('accepts an ApiError, and one that another copy of the package made', () => {
    expect(isApiError(new ApiError(404))).toBe(true);
    class OtherCopy extends Error {
      status = 404;
      toProblem = () => ({});
    }
    const foreign = new OtherCopy('x');
    foreign.name = 'ApiError';
    expect(isApiError(foreign)).toBe(true);
  });

  it('rejects other values', () => {
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError({ name: 'ApiError', status: 'no' })).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError('ApiError')).toBe(false);
  });
});

describe('ApiError', () => {
  it('turns into a problem', () => {
    expect(new ApiError(404, 'gone').toProblem()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'gone',
    });
  });
});

describe('resource', () => {
  const rows = [
    { id: 1, title: 'Red phone', price: 10 },
    { id: 2, title: 'Blue phone', price: 20 },
    { id: 3, title: 'Green lamp', price: 30 },
  ];
  const products = resource('products', Item, { searchBy: ['title'] });
  const call = (endpoint: (typeof products)[number], ctx: Record<string, unknown>, db: Db) =>
    endpoint.data?.({ params: {}, query: {}, body: undefined, headers: {}, db, ...ctx });

  it('expands to five endpoints', () => {
    expect(products.map((e) => e.id)).toEqual([
      'list.products',
      'get.products',
      'create.products',
      'update.products',
      'delete.products',
    ]);
    expect(products.map((e) => `${e.method} ${e.path}`)).toEqual([
      'GET /products',
      'GET /products/:id',
      'POST /products/add',
      'PATCH /products/:id',
      'DELETE /products/:id',
    ]);
    expect(products.create.status).toBe(201);
  });

  it('lists with dummyjson paging', () => {
    const db = memoryDb(rows);
    const query = products.list.query?.parse({ limit: '2', skip: '1' });
    expect(call(products.list, { query }, db)).toEqual({
      products: rows.slice(1, 3),
      total: 3,
      skip: 1,
      limit: 2,
    });
  });

  it('searches searchBy fields case-insensitively and counts matches', () => {
    const db = memoryDb(rows);
    const query = products.list.query?.parse({ q: 'PHONE' });
    expect(call(products.list, { query }, db)).toMatchObject({ total: 2, products: rows.slice(0, 2) });
  });

  it('limit 0 returns everything after skip', () => {
    const query = products.list.query?.parse({ limit: '0' });
    expect(call(products.list, { query }, memoryDb(rows))).toMatchObject({ total: 3, limit: 0 });
    expect((call(products.list, { query }, memoryDb(rows)) as { products: unknown[] }).products).toHaveLength(3);
  });

  it('supports a custom list key', () => {
    const users = resource('users', Item, { listKey: 'items' });
    const query = users.list.query?.parse({});
    expect(call(users.list, { query }, memoryDb(rows))).toHaveProperty('items');
  });

  it('answers 404 through ApiError for a missing item', () => {
    expect(() => call(products.get, { params: { id: '99' } }, memoryDb(rows))).toThrow(ApiError);
  });

  it('derives create and update bodies from the item schema', () => {
    expect(products.create.body?.safeParse({ title: 'a', price: 1 }).success).toBe(true);
    expect(products.create.body?.safeParse({ title: 'a' }).success).toBe(false);
    expect(products.update.body?.safeParse({ price: 5 }).success).toBe(true);
  });

  it('rejects unknown id and search fields', () => {
    expect(() => resource('x', Item, { idField: 'uuid' })).toThrow(/no "uuid" field/);
    expect(() => resource('x', Item, { searchBy: ['nope'] })).toThrow(/nope/);
  });
});

describe('defineConfig', () => {
  it('flattens resources, normalizes basePath and records resources', () => {
    const products = resource('products', Item, { seed: 5 });
    const health = defineEndpoint({ method: 'GET', path: '/health', response: z.object({ ok: z.boolean() }) });
    const config = defineConfig({ endpoints: [health, products], basePath: 'api/v1/' });
    expect(config.endpoints).toHaveLength(6);
    expect(config.basePath).toBe('/api/v1');
    expect(config.port).toBe(8443);
    expect(config.seed).toBe(1);
    expect(config.resources.map((r) => [r.name, r.seed])).toEqual([['products', 5]]);
    expect(mountedPath(config.basePath, '/health')).toBe('/api/v1/health');
  });

  it('rejects duplicate ids and routes', () => {
    const a = defineEndpoint({ method: 'GET', path: '/a', response: z.object({}) });
    expect(() => defineConfig({ endpoints: [a, a] })).toThrow(/Duplicate endpoint id/);
    const b = defineEndpoint({ id: 'other', method: 'GET', path: '/a', response: z.object({}) });
    expect(() => defineConfig({ endpoints: [a, b] })).toThrow(/Duplicate route/);
  });
});
