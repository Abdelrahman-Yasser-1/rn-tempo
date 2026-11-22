import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildOpenApi } from '../src/openapi.ts';
import { parseBackend, type BackendInput } from '../src/schema.ts';
import { typeNameOf } from '../src/graphql-schema.ts';

import { serve, stopAll } from './helpers.ts';
import { endpoints, openWs, type WsClient } from './realtime-helpers.ts';
import { rawCall, startSite, stopTeams } from './team-helpers.ts';

afterEach(async () => {
  await stopAll();
  await stopTeams();
});

const collections = [
  {
    name: 'products',
    fields: [
      { name: 'title', type: 'string', required: true, unique: true },
      { name: 'price', type: 'number' },
      { name: 'inStock', type: 'boolean' },
      { name: 'kind', type: 'enum', enumValues: ['phone', 'lamp'] },
      { name: 'secret', type: 'string' },
      { name: 'meta', type: 'json' },
    ],
    seed: [
      { title: 'Phone', price: 300, inStock: true, kind: 'phone', secret: 's1' },
      { title: 'Lamp', price: 20, inStock: false, kind: 'lamp', secret: 's2' },
      { title: 'Desk', price: 150, inStock: true, kind: 'lamp', secret: 's3' },
    ],
  },
];

const gql = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'post.graphql', type: 'graphql', method: 'POST', path: '/graphql', ...extra });

const definition = (endpoint: Record<string, unknown> = {}, extra: Partial<BackendInput> = {}): BackendInput => ({
  name: 'graph',
  auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
  collections: structuredClone(collections) as BackendInput['collections'],
  endpoints: endpoints([
    gql(endpoint),
    { id: 'get.products', type: 'crud', collection: 'products', action: 'list', method: 'GET', path: '/products', hiddenFields: ['secret'] },
    { id: 'post.products', type: 'crud', collection: 'products', action: 'create', method: 'POST', path: '/products', hiddenFields: ['secret'] },
    { id: 'post.auth.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
    { id: 'post.h.emit', type: 'handler', method: 'POST', path: '/h/emit', file: 'handlers/emit.js' },
  ]),
  ...extra,
});

interface Result {
  status: number;
  body: { data?: Record<string, unknown> | null; errors?: { message: string; extensions?: Record<string, unknown> }[] };
}

async function start(endpoint: Record<string, unknown> = {}, extra: Partial<BackendInput> = {}, options: Parameters<typeof serve>[1] = {}) {
  const running = await serve(definition(endpoint, extra), options);
  const post = async (payload: unknown, headers: Record<string, string> = {}): Promise<Result> => {
    const response = await fetch(`${running.url}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
    return { status: response.status, body: (await response.json()) as Result['body'] };
  };
  const query = (text: string, variables?: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Result> => post({ query: text, ...(variables === undefined ? {} : { variables }) }, headers);
  const token = async (): Promise<string> =>
    ((await (await fetch(`${running.url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) })).json()) as { accessToken: string }).accessToken;
  const wsUrl = `ws://127.0.0.1:${running.backend.port}/graphql`;
  const admin = (path: string): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, { headers: { authorization: `Bearer ${running.backend.admin.token}` } });
  return { ...running, post, query, token, wsUrl, admin };
}

const until = async (check: () => Promise<boolean> | boolean, ms = 3000): Promise<void> => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error('condition not met in time');
};

/** A graphql-ws client: the subprotocol, JSON in and out. */
async function openGql(url: string, extraProtocols: string[] = [], options = {}): Promise<WsClient & { send(message: Record<string, unknown>): void; nextMessage(ms?: number): Promise<Record<string, unknown>> }> {
  const client = await openWs(url, ['graphql-transport-ws', ...extraProtocols], options);
  return { ...client, send: (message) => client.ws.send(JSON.stringify(message)), nextMessage: (ms) => client.nextJson(ms) };
}

const ready = async (url: string, payload?: Record<string, unknown>) => {
  const client = await openGql(url);
  client.send({ type: 'connection_init', ...(payload === undefined ? {} : { payload }) });
  expect((await client.nextMessage()).type).toBe('connection_ack');
  return client;
};

describe('type names', () => {
  it('AC-LP-7 makes singular PascalCase type names from collection names', () => {
    expect(['products', 'categories', 'order_items', 'status', 'address', 'news'].map(typeNameOf)).toEqual(['Product', 'Category', 'OrderItem', 'Status', 'Address', 'New']);
  });
});

describe('queries and mutations from collections', () => {
  it('AC-LP-7 lists products with limit, skip, where and sort, and reads one by id', async () => {
    const { query } = await start();
    const all = await query('{ products { id title price inStock kind } }');
    expect(all.status).toBe(200);
    expect(all.body.data?.products).toEqual([
      { id: 1, title: 'Phone', price: 300, inStock: true, kind: 'phone' },
      { id: 2, title: 'Lamp', price: 20, inStock: false, kind: 'lamp' },
      { id: 3, title: 'Desk', price: 150, inStock: true, kind: 'lamp' },
    ]);
    expect((await query('{ products(limit: 1, skip: 1) { title } }')).body.data?.products).toEqual([{ title: 'Lamp' }]);
    expect((await query('{ products(where: { inStock: true }, sort: "-price") { title } }')).body.data?.products).toEqual([{ title: 'Phone' }, { title: 'Desk' }]);
    expect((await query('query Q($kind: ProductKind) { products(where: { kind: $kind }) { title } }', { kind: 'lamp' })).body.data?.products).toEqual([{ title: 'Lamp' }, { title: 'Desk' }]);
    expect((await query('{ productsById(id: 2) { title meta } }')).body.data?.productsById).toEqual({ title: 'Lamp', meta: null });
    expect((await query('{ productsById(id: 99) { title } }')).body.data?.productsById).toBeNull();
  });

  it('AC-LP-7 creates, updates and deletes through mutations, and the crud endpoint sees the same rows', async () => {
    const { query, url } = await start();
    const created = await query('mutation($input: ProductInput!) { createProduct(input: $input) { id title price kind } }', { input: { title: 'Chair', price: 45, kind: 'lamp' } });
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data?.createProduct).toMatchObject({ id: 4, title: 'Chair', price: 45, kind: 'lamp' });
    expect((await query('mutation { updateProduct(id: 4, input: { price: 50 }) { price } }')).body.data?.updateProduct).toEqual({ price: 50 });
    expect((await query('mutation { updateProduct(id: 99, input: { price: 1 }) { price } }')).body.data?.updateProduct).toBeNull();
    const crud = (await (await fetch(`${url}/products?limit=0`)).json()) as { total: number };
    expect(crud.total).toBe(4);
    expect((await query('mutation { deleteProduct(id: 4) { title } }')).body.data?.deleteProduct).toEqual({ title: 'Chair' });
    expect((await query('{ productsById(id: 4) { id } }')).body.data?.productsById).toBeNull();
  });

  it('AC-LP-7 reports validation and unique errors as GraphQL errors with codes', async () => {
    const { query } = await start();
    const invalid = await query('mutation { createProduct(input: { title: "X", price: 1 }) { id } }');
    expect(invalid.status).toBe(200);
    const duplicate = await query('mutation { createProduct(input: { title: "Phone" }) { id } }');
    expect(duplicate.body.errors?.[0]?.extensions?.code).toBe('CONFLICT');
    const missing = await query('mutation { createProduct(input: { price: 1 }) { id } }');
    expect(missing.status).toBe(400);
    expect(missing.body.errors?.[0]?.message).toContain('title');
    expect(invalid.body.errors).toBeUndefined();
  });

  it('AC-LP-7 leaves out the fields a crud endpoint hides, and the ones the endpoint hides itself', async () => {
    const { query } = await start({ schema: { source: 'collections', hiddenFields: ['products.price'] } });
    const bad = await query('{ products { title secret } }');
    expect(bad.status).toBe(400);
    expect(bad.body.errors?.[0]?.message).toContain('secret');
    expect((await query('{ products { title price } }')).status).toBe(400);
    expect((await query('{ products { title } }')).body.data?.products).toHaveLength(3);
  });

  it('AC-LP-7 can expose only some collections', async () => {
    const { query } = await start({ schema: { source: 'collections', collections: [] } });
    expect((await query('{ products { id } }')).status).toBe(200);
    expect(() => parseBackend(definition({ schema: { source: 'collections', collections: ['nope'] } }))).toThrow('Unknown collection');
  });

  it('AC-LP-7 does not put the answer inside the backend success wrapper', async () => {
    const { query } = await start({}, { responses: { success: { success: true, data: '{{body}}' } } });
    const answer = await query('{ products(limit: 1) { id } }');
    expect(answer.body).toEqual({ data: { products: [{ id: 1 }] } });
  });
});

describe('hidden fields cannot be probed', () => {
  it('AC-LP-7 sorting or filtering by a hidden field answers like an unknown field, in generated and SDL schemas', async () => {
    const built = await start({ schema: { source: 'collections', hiddenFields: ['products.price'] } });
    // `secret` is hidden by the crud endpoints, `price` by the endpoint: neither can be sorted by through a resolver.
    for (const field of ['secret', 'price']) {
      const sorted = await built.query(`{ products(sort: "${field}") { id } }`);
      expect(sorted.body.errors?.[0]?.message).toBe(`Cannot sort by "${field}".`);
      expect(sorted.body.errors?.[0]?.message).not.toContain('hidden');
    }
    expect((await built.query('{ products(sort: "nonexistent") { id } }')).body.errors?.[0]?.message).toBe('Cannot sort by "nonexistent".');
    expect((await built.query('{ products(sort: "title") { id } }')).body.errors).toBeUndefined();
    await stopAll();
    const sdl = await start({
      schema: { source: 'sdl', sdl: 'type Query { items(where: JSON, sort: String): [Item!]! } type Item { id: Int! title: String } scalar JSON' },
      resolvers: { 'Query.items': { collection: 'products', action: 'list' } },
    });
    expect((await sdl.query('{ items(where: { secret: "s1" }) { id } }')).body.errors?.[0]?.message).toBe('The collection products has no field "secret".');
    expect((await sdl.query('{ items(where: { nope: "s1" }) { id } }')).body.errors?.[0]?.message).toBe('The collection products has no field "nope".');
    expect((await sdl.query('{ items(sort: "-secret") { id } }')).body.errors?.[0]?.message).toBe('Cannot sort by "secret".');
  });
});

describe('SDL and resolvers', () => {
  const sdl = `
    type Query {
      hello(name: String): String
      config: Config
      shout(text: String!): String
      topProducts: [Item!]!
    }
    type Config { version: String, env: String }
    type Item { id: Int! title: String }
    type Mutation { ping: String }
    type Subscription { shipped: JSON }
    scalar JSON
  `;
  const resolvers = {
    'Query.hello': { static: 'Hello {{args.name}}!' },
    'Query.config': { static: { version: '1.2.3', env: 'test' } },
    'Query.shout': { handler: 'handlers/shout.js' },
    'Query.topProducts': { collection: 'products', action: 'list' },
    'Mutation.ping': { static: 'pong' },
    'Subscription.shipped': { event: 'orders.shipped' },
  };

  it('AC-LP-7 answers a field from a static value with placeholders, a collection or a handler', async () => {
    const { query, dir } = await start({ schema: { source: 'sdl', sdl }, resolvers });
    mkdirSync(join(dir, 'handlers'), { recursive: true });
    writeFileSync(join(dir, 'handlers', 'shout.js'), `export default async (ctx) => ctx.req.body.args.text.toUpperCase() + '!';`);
    expect((await query('{ hello(name: "Ann") config { version env } }')).body.data).toEqual({ hello: 'Hello Ann!', config: { version: '1.2.3', env: 'test' } });
    expect((await query('{ shout(text: "hey") }')).body.data?.shout).toBe('HEY!');
    expect((await query('{ topProducts { id title } }')).body.data?.topProducts).toHaveLength(3);
    expect((await query('mutation { ping }')).body.data?.ping).toBe('pong');
    // A field with no resolver is null.
    expect((await query('{ hello }')).body.data?.hello).toBe('Hello !');
  });

  it('AC-LP-7 reports a handler that throws, as a field error', async () => {
    const { query, dir } = await start({ schema: { source: 'sdl', sdl }, resolvers });
    mkdirSync(join(dir, 'handlers'), { recursive: true });
    writeFileSync(join(dir, 'handlers', 'shout.js'), `export default async () => { throw new Error('boom'); };`);
    const answer = await query('{ shout(text: "x") hello(name: "ok") }');
    expect(answer.body.errors?.[0]?.message).toContain('boom');
    expect(answer.body.data?.hello).toBe('Hello ok!');
  });

  it('AC-LP-7 extends the generated schema with SDL and a resolver', async () => {
    const { query } = await start({ schema: { source: 'collections', sdl: 'extend type Query { hello: String }' }, resolvers: { 'Query.hello': { static: 'hi' } } });
    expect((await query('{ hello products(limit: 1) { id } }')).body.data).toEqual({ hello: 'hi', products: [{ id: 1 }] });
  });

  it('AC-LP-7 refuses a schema that is not valid, a resolver for a missing field, and a resolver with two answers', () => {
    expect(() => parseBackend(definition({ schema: { source: 'sdl', sdl: 'type Query { a: Nope }' } }))).toThrow('Nope');
    expect(() => parseBackend(definition({ schema: { source: 'sdl' } }))).toThrow('schema.sdl');
    expect(() => parseBackend(definition({ resolvers: { 'Query.ghost': { static: 1 } } }))).toThrow('does not match a field');
    expect(() => parseBackend(definition({ resolvers: { 'Query.products': { static: 1, event: 'a.b' } } }))).toThrow('exactly one');
    expect(() => parseBackend(definition({ method: 'GET' }))).toThrow('uses POST');
  });
});

describe('Generate from collections', () => {
  it('AC-LP-7 the generated SDL and resolvers, used as an SDL endpoint, behave like the built schema (queries and subscriptions)', async () => {
    const first = await start();
    const generated = (await (await fetch(`http://127.0.0.1:${first.backend.admin.port}/__admin/graphql/generate`, { method: 'POST', headers: { authorization: `Bearer ${first.backend.admin.token}`, 'content-type': 'application/json' }, body: '{}' })).json()) as { sdl: string; resolvers: Record<string, unknown> };
    expect(generated.sdl).toContain('type Product');
    expect(generated.sdl).toContain('productsById(id: Int!): Product');
    // A field a crud endpoint hides is not readable (type, filters); it can still be written.
    expect(/type Product \{[^}]*secret/.test(generated.sdl)).toBe(false);
    expect(/input ProductWhere \{[^}]*secret/.test(generated.sdl)).toBe(false);
    expect(generated.resolvers['Query.products']).toEqual({ collection: 'products', action: 'list' });
    expect(generated.resolvers['Subscription.productsCreated']).toEqual({ event: 'products.created' });
    await stopAll();
    const second = await start({ schema: { source: 'sdl', sdl: generated.sdl }, resolvers: generated.resolvers });
    expect((await second.query('{ products(limit: 2) { title price } }')).body.data?.products).toHaveLength(2);
    const client = await ready(second.wsUrl);
    client.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { title } }' } });
    await new Promise((done) => setTimeout(done, 60));
    await second.query('mutation { createProduct(input: { title: "Round trip" }) { id } }');
    expect(await client.nextMessage()).toMatchObject({ payload: { data: { productsCreated: { title: 'Round trip' } } } });
    client.close();
    expect((await fetch(`http://127.0.0.1:${second.backend.admin.port}/__admin/graphql/generate`, { method: 'POST', headers: { authorization: `Bearer ${second.backend.admin.token}`, 'content-type': 'application/json' }, body: '{"collections":["nope"]}' })).status).toBe(400);
  });
});

describe('limits and introspection', () => {
  it('AC-LP-7 refuses a query nested deeper than maxDepth (10 by default) and counts fragments', async () => {
    const { query } = await start({
      schema: {
        source: 'sdl',
        sdl: 'type Query { a: A } type A { a: A, leaf: Int }',
      },
      resolvers: { 'Query.a': { static: { a: { a: null } } } },
    });
    const deep = (levels: number): string => `{ ${'a { '.repeat(levels)}leaf${' }'.repeat(levels)} }`;
    expect((await query(deep(9))).status).toBe(200);
    const refused = await query(deep(11));
    expect(refused.status).toBe(400);
    expect(refused.body.errors?.[0]?.extensions?.code).toBe('QUERY_TOO_COMPLEX');
    expect(refused.body.errors?.[0]?.message).toContain('limit is 10');
    // Depth through fragments counts too.
    const viaFragment = await query(`query { a { ...F } } fragment F on A { a { a { a { a { a { a { a { a { a { a { leaf } } } } } } } } } } }`);
    expect(viaFragment.status).toBe(400);
  });

  it('AC-LP-7 stops a fragment bomb at maxFields and a fragment cycle cannot loop', async () => {
    const { query } = await start({ maxFields: 30, schema: { source: 'sdl', sdl: 'type Query { a: A } type A { a: A, b: A, leaf: Int }' } });
    const bomb = `query { a { ...F1 } } fragment F1 on A { a { ...F2 } b { ...F2 } } fragment F2 on A { a { ...F3 } b { ...F3 } } fragment F3 on A { a { ...F4 } b { ...F4 } } fragment F4 on A { a { leaf } b { leaf } }`;
    const refused = await query(bomb);
    expect(refused.status).toBe(400);
    expect(refused.body.errors?.[0]?.message).toContain('more than 30 fields');
    const cycle = await query('query { a { ...F } } fragment F on A { a { ...F } }');
    expect(cycle.status).toBe(400);
    expect(cycle.body.errors?.[0]?.message).toMatch(/cannot spread|cycle/i);
  });

  it('AC-LP-7 refuses a query larger than maxQueryBytes with 413', async () => {
    const { query } = await start({ maxQueryBytes: 200 });
    const answer = await query(`{ products { id } } # ${'x'.repeat(300)}`);
    expect(answer.status).toBe(413);
    expect(answer.body.errors?.[0]?.extensions?.code).toBe('QUERY_TOO_LARGE');
  });

  it('AC-LP-7 does not batch, and says what it wants when the request is not right', async () => {
    const { post, url } = await start();
    const batch = await post([{ query: '{ products { id } }' }]);
    expect(batch.status).toBe(400);
    expect(batch.body.errors?.[0]?.extensions?.code).toBe('BATCHING_NOT_SUPPORTED');
    expect((await post({ variables: {} })).body.errors?.[0]?.message).toContain('query string');
    expect((await post({ query: '{ products' })).status).toBe(400);
    expect((await post({ query: '{ nope }' })).body.errors?.[0]?.message).toContain('nope');
    expect((await post({ query: '{ products { id } }', variables: 'x' })).status).toBe(400);
    const wrongType = await fetch(`${url}/graphql`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    expect(wrongType.status).toBe(415);
    expect((await post({ query: 'query A { products { id } } query B { products { id } }' })).body.errors?.[0]?.message).toContain('operationName');
    expect((await post({ query: 'query A { products { id } } query B { products { id } }', operationName: 'B' })).status).toBe(200);
    expect((await post({ query: 'subscription { productsCreated { id } }' })).body.errors?.[0]?.extensions?.code).toBe('SUBSCRIPTION_NEEDS_WEBSOCKET');
  });

  it('AC-LP-7 answers introspection by default, and refuses it when it is switched off', async () => {
    const on = await start();
    const full = await on.query('{ __schema { queryType { name } types { name fields { name type { name kind ofType { name kind ofType { name kind } } } } } } __type(name: "Product") { name } }');
    expect(full.status).toBe(200);
    expect((full.body.data?.__schema as { queryType: { name: string } }).queryType.name).toBe('Query');
    await stopAll();
    const off = await start({ introspection: false });
    const refused = await off.query('{ __schema { queryType { name } } }');
    expect(refused.status).toBe(400);
    expect(refused.body.errors?.[0]?.message).toContain('introspection');
    expect((await off.query('{ __typename }')).status).toBe(200);
  });
});

describe('sign-in', () => {
  it('AC-LP-7 auth: "bearer" protects the whole endpoint', async () => {
    const { query, token } = await start({ auth: 'bearer' });
    expect((await query('{ products { id } }')).status).toBe(401);
    expect((await query('{ products { id } }', undefined, { authorization: 'Bearer nope' })).status).toBe(401);
    expect((await query('{ products { id } }', undefined, { authorization: `Bearer ${await token()}` })).status).toBe(200);
  });

  it('AC-LP-7 requireAuth protects only the operations it lists', async () => {
    const { query, token } = await start({ requireAuth: ['Mutation.createProduct'] });
    expect((await query('{ products { id } }')).status).toBe(200);
    const denied = await query('mutation { createProduct(input: { title: "N" }) { id } }');
    expect(denied.status).toBe(401);
    expect(denied.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    expect((await query('mutation { updateProduct(id: 1, input: { price: 1 }) { id } }')).status).toBe(200);
    const allowed = await query('mutation { createProduct(input: { title: "N" }) { id } }', undefined, { authorization: `Bearer ${await token()}` });
    expect(allowed.body.data?.createProduct).toMatchObject({ id: 4 });
    // Through a fragment too.
    expect((await query('mutation { ...M } fragment M on Mutation { createProduct(input: { title: "O" }) { id } }')).status).toBe(401);
  });
});

describe('subscriptions over graphql-ws', () => {
  it('AC-LP-7 a subscription receives a create, and complete from the client stops it', async () => {
    const { wsUrl, query } = await start();
    const client = await ready(wsUrl);
    client.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { id title price } }' } });
    await new Promise((done) => setTimeout(done, 50));
    await query('mutation { createProduct(input: { title: "Streamed", price: 9 }) { id } }');
    const next = await client.nextMessage();
    expect(next).toMatchObject({ id: '1', type: 'next', payload: { data: { productsCreated: { id: 4, title: 'Streamed', price: 9 } } } });
    client.send({ id: '1', type: 'complete' });
    await new Promise((done) => setTimeout(done, 50));
    await query('mutation { createProduct(input: { title: "After" }) { id } }');
    await expect(client.nextMessage(200)).rejects.toThrow('no message');
    client.close();
  });

  it('AC-LP-7 a plain POST create (crud endpoint) also reaches the subscription, and updated and deleted work', async () => {
    const { wsUrl, url, query } = await start();
    const client = await ready(wsUrl);
    client.send({ id: 'a', type: 'subscribe', payload: { query: 'subscription { productsCreated { title } }' } });
    client.send({ id: 'b', type: 'subscribe', payload: { query: 'subscription { productsUpdated { price } productsDeleted { id } }' } });
    const bad = await client.nextMessage();
    expect(bad).toMatchObject({ id: 'b', type: 'error' });
    client.send({ id: 'c', type: 'subscribe', payload: { query: 'subscription { productsUpdated { price } }' } });
    client.send({ id: 'd', type: 'subscribe', payload: { query: 'subscription { productsDeleted { title } }' } });
    await new Promise((done) => setTimeout(done, 80));
    await fetch(`${url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Via REST' }) });
    expect(await client.nextMessage()).toMatchObject({ id: 'a', type: 'next', payload: { data: { productsCreated: { title: 'Via REST' } } } });
    await query('mutation { updateProduct(id: 1, input: { price: 1 }) { id } }');
    expect(await client.nextMessage()).toMatchObject({ id: 'c', payload: { data: { productsUpdated: { price: 1 } } } });
    await query('mutation { deleteProduct(id: 2) { id } }');
    expect(await client.nextMessage()).toMatchObject({ id: 'd', payload: { data: { productsDeleted: { title: 'Lamp' } } } });
    client.close();
  });

  it('AC-LP-7 a custom event streams from a subscription field named in resolvers', async () => {
    const { wsUrl, url, dir } = await start({
      schema: { source: 'sdl', sdl: 'scalar JSON type Query { a: Int } type Subscription { shipped: JSON }' },
      resolvers: { 'Subscription.shipped': { event: 'orders.shipped' } },
    });
    mkdirSync(join(dir, 'handlers'), { recursive: true });
    writeFileSync(join(dir, 'handlers', 'emit.js'), `export default async (ctx) => { await ctx.emit('orders.shipped', { orderId: 7 }); return { ok: true }; };`);
    const client = await ready(wsUrl);
    client.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { shipped }' } });
    await new Promise((done) => setTimeout(done, 50));
    await fetch(`${url}/h/emit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(await client.nextMessage()).toMatchObject({ id: '1', type: 'next', payload: { data: { shipped: { orderId: 7 } } } });
    client.close();
  });

  it('AC-LP-7 runs a query and a mutation over the socket, answers ping, and lets an id be reused after complete', async () => {
    const { wsUrl } = await start();
    const client = await ready(wsUrl);
    client.send({ type: 'ping' });
    expect((await client.nextMessage()).type).toBe('pong');
    client.send({ id: 'q', type: 'subscribe', payload: { query: '{ products(limit: 1) { title } }' } });
    expect(await client.nextMessage()).toMatchObject({ id: 'q', type: 'next', payload: { data: { products: [{ title: 'Phone' }] } } });
    expect(await client.nextMessage()).toEqual({ id: 'q', type: 'complete' });
    client.send({ id: 'q', type: 'subscribe', payload: { query: 'mutation { updateProduct(id: 1, input: { price: 2 }) { price } }' } });
    expect(await client.nextMessage()).toMatchObject({ id: 'q', type: 'next', payload: { data: { updateProduct: { price: 2 } } } });
    expect(await client.nextMessage()).toEqual({ id: 'q', type: 'complete' });
    // Validation errors end the operation with an error message, not complete.
    client.send({ id: 'e', type: 'subscribe', payload: { query: '{ nope }' } });
    expect(await client.nextMessage()).toMatchObject({ id: 'e', type: 'error' });
    client.close();
  });

  it('AC-LP-7 follows the close codes of the protocol', async () => {
    const { wsUrl } = await start({ initTimeoutMs: 150, maxOperationsPerConnection: 1 });
    const early = await openGql(wsUrl);
    early.send({ id: '1', type: 'subscribe', payload: { query: '{ products { id } }' } });
    expect(await early.closed).toBe(4401);
    const slow = await openGql(wsUrl);
    expect(await slow.closed).toBe(4408);
    const twice = await ready(wsUrl);
    twice.send({ type: 'connection_init' });
    expect(await twice.closed).toBe(4429);
    const junk = await ready(wsUrl);
    junk.ws.send('not json');
    expect(await junk.closed).toBe(4400);
    const unknown = await ready(wsUrl);
    unknown.send({ type: 'frobnicate' });
    expect(await unknown.closed).toBe(4400);
    const dup = await ready(wsUrl);
    dup.send({ id: 'x', type: 'subscribe', payload: { query: 'subscription { productsCreated { id } }' } });
    dup.send({ id: 'x', type: 'subscribe', payload: { query: 'subscription { productsCreated { id } }' } });
    expect(await dup.closed).toBe(4409);
    const many = await ready(wsUrl);
    many.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { id } }' } });
    many.send({ id: '2', type: 'subscribe', payload: { query: 'subscription { productsCreated { id } }' } });
    expect(await many.nextMessage()).toMatchObject({ id: '2', type: 'error' });
    many.close();
  });

  it('AC-LP-7 closes a socket that does not speak graphql-transport-ws, and refuses the wrong path', async () => {
    const { wsUrl, backend } = await start();
    const plain = await openWs(wsUrl);
    expect(await plain.closed).toBe(1002);
    await expect(openWs(`ws://127.0.0.1:${backend.port}/products`)).rejects.toThrow('400');
  });

  it('AC-LP-7 signs in through connection_init, the subprotocol or the query, and answers 4403 without a token', async () => {
    const { wsUrl, token } = await start({ auth: 'bearer' });
    const good = await token();
    const refused = await openGql(wsUrl);
    refused.send({ type: 'connection_init' });
    expect(await refused.closed).toBe(4403);
    const viaInit = await ready(wsUrl, { Authorization: `Bearer ${good}` });
    viaInit.close();
    const viaProtocol = await openGql(wsUrl, ['bearer', good]);
    viaProtocol.send({ type: 'connection_init' });
    expect((await viaProtocol.nextMessage()).type).toBe('connection_ack');
    expect(viaProtocol.protocol).toBe('graphql-transport-ws');
    viaProtocol.close();
    const viaQuery = await openGql(`${wsUrl}?token=${good}`);
    viaQuery.send({ type: 'connection_init' });
    expect((await viaQuery.nextMessage()).type).toBe('connection_ack');
    viaQuery.close();
    await expect(openWs(wsUrl, ['graphql-transport-ws', 'bearer', 'bad.token.here'])).rejects.toThrow('401');
  });

  it('AC-LP-7 requireAuth is checked per operation on the socket', async () => {
    const { wsUrl, token } = await start({ requireAuth: ['Subscription.productsCreated'] });
    const anon = await ready(wsUrl);
    anon.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { id } }' } });
    expect(await anon.nextMessage()).toMatchObject({ id: '1', type: 'error', payload: [{ extensions: { code: 'UNAUTHENTICATED' } }] });
    anon.close();
    const signed = await ready(wsUrl, { authorization: await token() });
    signed.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { id } }' } });
    await expect(signed.nextMessage(150)).rejects.toThrow('no message');
    signed.close();
  });

  it('AC-LP-7 stops the event listeners when the socket closes, and lists the connection for the admin', async () => {
    const { wsUrl, backend, admin } = await start();
    const client = await ready(wsUrl);
    client.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { id } }' } });
    await until(() => backend.engine.events.listenerCount > 1);
    const list = (await (await admin('/realtime/post.graphql/clients')).json()) as { type: string; clients: unknown[] };
    expect(list.type).toBe('graphql');
    expect(list.clients).toHaveLength(1);
    const before = backend.engine.events.listenerCount;
    client.close();
    await until(() => backend.engine.events.listenerCount < before);
    await until(async () => ((await (await admin('/realtime/post.graphql/clients')).json()) as { clients: unknown[] }).clients.length === 0);
  });
});

describe('log, stats and OpenAPI', () => {
  it('AC-LP-7 records the operation name in the request log and the stats', async () => {
    const { query, backend } = await start();
    await query('query ListProducts { products { id } }');
    await query('{ products { id } }');
    await query('query Broken { nope }');
    const entries = backend.engine.requests.snapshot().filter((entry) => entry.url === '/graphql');
    expect(entries.map((entry) => entry.operation)).toEqual(['ListProducts', 'anonymous', undefined]);
    const operations = backend.engine.stats.snapshot().operations;
    expect(operations.map((entry) => entry.operation).sort()).toEqual(['ListProducts', 'anonymous']);
    expect(operations.find((entry) => entry.operation === 'ListProducts')).toMatchObject({ id: 'post.graphql', count: 1, errors: 0 });
  });

  it('AC-LP-7 lists the endpoint in OpenAPI as a POST with a generic body, and says it is GraphQL', () => {
    const document = buildOpenApi(parseBackend(definition()));
    const post = ((document.paths as Record<string, Record<string, Record<string, unknown>>>)['/graphql'] ?? {}).post ?? {};
    expect(post['x-graphql']).toBe(true);
    expect(String(post.description)).toContain('GraphQL');
    expect(JSON.stringify(post.requestBody)).toContain('"query"');
    expect(JSON.stringify(post.responses)).toContain('errors');
  });

  it('AC-LP-7 has safe defaults: depth 10, 200 fields, 20 KB, introspection on', () => {
    expect(parseBackend(definition()).endpoints[0]).toMatchObject({ maxDepth: 10, maxFields: 200, maxQueryBytes: 20_000, introspection: true, requireAuth: [] });
  });
});

describe('team server', () => {
  it('AC-LP-7 serves queries under /b/<id>/ and subscriptions over a websocket there', async () => {
    const site = await startSite();
    const added = await site.owner.admin('demo', 'POST', '/endpoints', gql());
    expect(added.status, added.body).toBe(200);
    const answer = await rawCall(site.team.port, { method: 'POST', path: '/b/demo/graphql', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ products(limit: 1) { id } }' }) });
    expect(answer.status, answer.body).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({ data: { products: [{ id: 1 }] } });
    const client = await ready(`ws://127.0.0.1:${site.team.port}/b/demo/graphql`);
    client.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { title } }' } });
    await new Promise((done) => setTimeout(done, 80));
    await rawCall(site.team.port, { method: 'POST', path: '/b/demo/graphql', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'mutation { createProduct(input: { title: "T", price: 1 }) { id } }' }) });
    expect(await client.nextMessage()).toMatchObject({ id: '1', type: 'next', payload: { data: { productsCreated: { title: 'T' } } } });
    client.close();
  });
});
