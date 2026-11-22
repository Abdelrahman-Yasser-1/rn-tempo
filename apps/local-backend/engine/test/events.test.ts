import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { crudEndpoints } from '../src/folder.ts';
import { matchesEvent, type BackendEvent } from '../src/events.ts';
import type { BackendInput } from '../src/schema.ts';
import { setupTempoBackend } from '../src/test-kit/index.ts';

import { serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const definition = (): BackendInput => ({
  name: 'events',
  collections: [{ name: 'products', fields: [{ name: 'title', type: 'string', required: true }, { name: 'secret', type: 'string' }], seed: [{ title: 'Lamp' }] }],
  contentTypes: [{ name: 'article', label: 'Article', fields: [{ name: 'title', type: 'string', required: true }] }],
  endpoints: [
    ...(crudEndpoints('products', { basePath: '/products' }) as NonNullable<BackendInput['endpoints']>),
    { id: 'post.h.make', type: 'handler', method: 'POST', path: '/h/make', file: 'handlers/make.js' },
  ] as NonNullable<BackendInput['endpoints']>,
});

async function start() {
  const running = await serve(definition());
  const seen: BackendEvent[] = [];
  running.backend.engine.events.on((event) => seen.push(event));
  const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${running.backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const post = (path: string, body: unknown, method = 'POST'): Promise<Response> =>
    fetch(`${running.url}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { ...running, seen, admin, post };
}

describe('data change events', () => {
  it('AC-LP-7 a crud create, update and delete publish products.created/updated/deleted with { collection, id, record }', async () => {
    const { post, url, seen } = await start();
    const created = (await (await post('/products', { title: 'Desk' })).json()) as { id: number };
    await post(`/products/${String(created.id)}`, { title: 'Desk 2' }, 'PUT');
    await fetch(`${url}/products/${String(created.id)}`, { method: 'DELETE' });
    expect(seen.map((event) => event.name)).toEqual(['products.created', 'products.updated', 'products.deleted']);
    expect(seen[0]?.payload).toMatchObject({ collection: 'products', id: created.id, record: { title: 'Desk' } });
    expect(seen[1]?.payload).toMatchObject({ record: { title: 'Desk 2' } });
    // The delete carries the row as it was.
    expect(seen[2]?.payload).toMatchObject({ id: created.id, record: { title: 'Desk 2' } });
    expect(Date.parse(seen[0]?.at ?? '')).not.toBeNaN();
  });

  it('AC-LP-7 an update or delete of a row that does not exist publishes nothing', async () => {
    const { post, url, seen } = await start();
    await post('/products/999', { title: 'x' }, 'PUT');
    await fetch(`${url}/products/999`, { method: 'DELETE' });
    await post('/products', { title: 7 });
    expect(seen).toEqual([]);
  });

  it('AC-LP-7 the admin data browser publishes events too', async () => {
    const { admin, seen } = await start();
    const row = (await (await admin('/data/products', 'POST', { title: 'Admin row' })).json()) as { id: number };
    await admin(`/data/products/${String(row.id)}`, 'PATCH', { title: 'Renamed' });
    await admin(`/data/products/${String(row.id)}`, 'DELETE');
    expect(seen.map((event) => event.name)).toEqual(['products.created', 'products.updated', 'products.deleted']);
  });

  it('AC-LP-7 a handler db write publishes, and ctx.emit publishes a custom event', async () => {
    const { dir, post, seen } = await start();
    mkdirSync(join(dir, 'handlers'), { recursive: true });
    writeFileSync(join(dir, 'handlers', 'make.js'), `export default async (ctx) => { await ctx.db.create('products', { title: 'From handler' }); await ctx.emit('orders.shipped', { orderId: 7 }); return { ok: true }; };`);
    expect((await post('/h/make', {})).status).toBe(200);
    expect(seen.map((event) => event.name)).toEqual(['products.created', 'orders.shipped']);
    expect(seen[1]?.payload).toEqual({ orderId: 7 });
  });

  it('AC-LP-7 ctx.emit refuses a name that is not plain', async () => {
    const { dir, post, seen } = await start();
    mkdirSync(join(dir, 'handlers'), { recursive: true });
    writeFileSync(join(dir, 'handlers', 'make.js'), `export default async (ctx) => { await ctx.emit('bad name!', 1); return { ok: true }; };`);
    expect((await post('/h/make', {})).status).toBe(500);
    expect(seen).toEqual([]);
  });

  it('AC-LP-7 publishing and unpublishing a content entry publish content.published and content.unpublished', async () => {
    const { admin, seen } = await start();
    const entry = (await (await admin('/content/entries', 'POST', { type: 'article', values: { en: { title: 'Hello' } } })).json()) as { id: number };
    await admin(`/content/entries/${String(entry.id)}/publish`, 'POST', {});
    await admin(`/content/entries/${String(entry.id)}/unpublish`, 'POST', {});
    expect(seen.map((event) => event.name)).toEqual(['content.published', 'content.unpublished']);
    expect(seen[0]?.payload).toMatchObject({ type: 'article', id: entry.id });
  });

  it('AC-LP-7 the test kit data.insert publishes', async () => {
    const kit = setupTempoBackend({ source: join(import.meta.dirname, 'fixtures', 'jest-project', 'backend'), hooks: false });
    try {
      await kit.start();
      const seen: string[] = [];
      kit.events.on((event) => seen.push(event.name));
      kit.data.insert('products', { title: 'Kit row', price: 1 });
      expect(seen).toEqual(['products.created']);
    } finally {
      await kit.stop();
    }
  });
});

describe('events fire after the commit', () => {
  it('AC-LP-7 inside a transaction nothing is published until it commits, and the listener then sees the data', async () => {
    const { backend } = await start();
    const { store, events } = backend.engine;
    const log: string[] = [];
    events.on((event) => {
      const id = (event.payload as { id: number }).id;
      log.push(`${event.name} inTransaction=${String(store.db.isTransaction)} found=${String(store.has('products', id))}`);
    });
    store.transaction(() => {
      store.insert('products', { title: 'A' });
      store.insert('products', { title: 'B' });
      expect(log).toEqual([]);
    });
    expect(log).toEqual(['products.created inTransaction=false found=true', 'products.created inTransaction=false found=true']);
  });

  it('AC-LP-7 a rollback publishes nothing', async () => {
    const { backend } = await start();
    const { store, events } = backend.engine;
    const names: string[] = [];
    events.on((event) => names.push(event.name));
    expect(() =>
      store.transaction(() => {
        store.insert('products', { title: 'Gone' });
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(names).toEqual([]);
    expect(store.count('products')).toBe(1);
  });

  it('AC-LP-7 a listener that throws does not stop the write or the other listeners', async () => {
    const { backend, post } = await start();
    const names: string[] = [];
    backend.engine.events.on(() => {
      throw new Error('bad listener');
    });
    backend.engine.events.on((event) => names.push(event.name));
    expect((await post('/products', { title: 'Fine' })).status).toBe(201);
    expect(names).toEqual(['products.created']);
  });
});

describe('matchesEvent', () => {
  it('AC-LP-7 matches names, prefixes with * and everything with *, with no regular expressions', () => {
    expect(matchesEvent(['products.created'], 'products.created')).toBe(true);
    expect(matchesEvent(['products.created'], 'products.updated')).toBe(false);
    expect(matchesEvent(['products.*'], 'products.deleted')).toBe(true);
    expect(matchesEvent(['products.*'], 'orders.created')).toBe(false);
    expect(matchesEvent(['*'], 'anything')).toBe(true);
    expect(matchesEvent([], 'anything')).toBe(false);
    expect(matchesEvent(['.*'], 'products.created')).toBe(false);
  });
});
