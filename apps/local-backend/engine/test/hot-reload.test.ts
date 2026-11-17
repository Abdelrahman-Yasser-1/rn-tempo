import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { crudEndpoints } from '../src/folder.ts';
import type { BackendInput } from '../src/schema.ts';

import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const base: BackendInput = {
  name: 'live',
  collections: [
    {
      name: 'products',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'sku', type: 'string', unique: true },
      ],
      seed: [{ title: 'Lamp', sku: 'A1' }],
    },
  ],
  endpoints: [
    ...crudEndpoints('products', { basePath: '/products' }),
    { id: 'hello', type: 'static', method: 'GET', path: '/hello', body: { v: 1 }, scenarios: { slow: { delayMs: 300 } } },
  ],
};

async function setup(options: Parameters<typeof serve>[1] = {}) {
  const { backend, url, dir } = await serve(base, options);
  // The OS file watcher needs a moment to be live before an edit is reliably reported.
  if (options.watch !== false) await new Promise((resolve) => setTimeout(resolve, 150));
  const call = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { backend, url, dir, call };
}

describe('AC-LB-2: changes apply on the next request, without a restart', () => {
  it('adding, editing and deleting an endpoint', async () => {
    const { url, call } = await setup();
    expect((await fetch(`${url}/extra`)).status).toBe(404);
    const added = await call('/endpoints', 'POST', { id: 'extra', type: 'static', method: 'GET', path: '/extra', body: { n: 1 } });
    expect(added.status).toBe(200);
    expect(await json(await fetch(`${url}/extra`))).toEqual({ n: 1 });
    await call('/endpoints/extra', 'PUT', { id: 'extra', type: 'static', method: 'GET', path: '/extra', status: 202, body: { n: 2 } });
    const edited = await fetch(`${url}/extra`);
    expect(edited.status).toBe(202);
    expect(await json(edited)).toEqual({ n: 2 });
    expect((await call('/endpoints/extra', 'DELETE')).status).toBe(200);
    expect((await fetch(`${url}/extra`)).status).toBe(404);
    expect((await call('/endpoints/extra', 'DELETE')).status).toBe(404);
  });

  it('adding, editing and deleting a collection field', async () => {
    const { url, call } = await setup();
    const add = await call('/collections/products/fields', 'POST', { name: 'color', type: 'string', default: 'red' });
    expect(add.status).toBe(200);
    expect(await json(await fetch(`${url}/products/1`))).toMatchObject({ color: 'red' });
    const created = await fetch(`${url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'T', color: 'blue' }) });
    expect(await json(created)).toMatchObject({ color: 'blue' });
    await call('/collections/products/fields/color', 'PUT', { name: 'color', type: 'enum', enumValues: ['red', 'blue'] });
    // An enum is a different type, so the old values are dropped: that needs confirm.
    const unconfirmed = await call('/collections/products/fields/color', 'PUT', { name: 'color', type: 'enum', enumValues: ['red', 'blue'] });
    expect(unconfirmed.status).toBe(409);
    expect((await call('/collections/products/fields/color?confirm=true', 'PUT', { name: 'color', type: 'enum', enumValues: ['red', 'blue'] })).status).toBe(200);
    expect((await fetch(`${url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'X', color: 'green' }) })).status).toBe(400);
    expect((await call('/collections/products/fields/color?confirm=true', 'DELETE')).status).toBe(200);
    expect(await json(await fetch(`${url}/products/1`))).not.toHaveProperty('color');
  });

  it('a destructive change answers 409 with what would be lost, and changes nothing without confirm', async () => {
    const { url, call } = await setup();
    const refused = await call('/collections/products/fields/sku', 'DELETE');
    expect(refused.status).toBe(409);
    const body = await json(refused);
    expect(body).toMatchObject({ confirmRequired: true, lost: [{ kind: 'field', collection: 'products', field: 'sku', rows: 1 }] });
    expect(await json(await fetch(`${url}/products/1`))).toMatchObject({ sku: 'A1' });
    expect((await call('/collections/products/fields/sku?confirm=true', 'DELETE')).status).toBe(200);
    expect(await json(await fetch(`${url}/products/1`))).not.toHaveProperty('sku');
    expect((await call('/collections/products', 'DELETE')).status).toBe(400); // crud endpoints still point at it
  });

  it('renames a field with its data, endpoint references and unique index', async () => {
    const { url, call } = await setup();
    const renamed = await call('/collections/products/fields/sku/rename', 'POST', { to: 'code' });
    expect(renamed.status).toBe(200);
    expect(await json(await fetch(`${url}/products/1`))).toMatchObject({ code: 'A1', title: 'Lamp' });
    expect((await fetch(`${url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'D', code: 'A1' }) })).status).toBe(409);
    const definition = (await json(await call('/definition'))) as BackendInput;
    expect(definition.collections?.[0]?.fields?.map((f) => f.name)).toEqual(['title', 'code']);
  });

  it('renames a collection and the endpoints that use it, then drops it with confirm', async () => {
    const { url, call, backend } = await setup();
    expect((await call('/collections/products/rename', 'POST', { to: 'goods' })).status).toBe(200);
    expect(backend.engine.store.count('goods')).toBe(1);
    expect((await fetch(`${url}/products/1`)).status).toBe(200); // the paths stay, the collection behind them moved
    for (const id of backend.engine.definition.endpoints.map((e) => e.id).filter((id) => id.startsWith('products.'))) await call(`/endpoints/${id}`, 'DELETE');
    expect((await call('/collections/goods', 'DELETE')).status).toBe(409);
    expect((await call('/collections/goods?confirm=true', 'DELETE')).status).toBe(200);
    expect((await json(await call('/collections'))).length ?? 0).toBe(0);
  });

  it('adds a collection with seed rows', async () => {
    const { url, call } = await setup();
    await call('/collections', 'POST', { name: 'tags', fields: [{ name: 'label', type: 'string' }], seed: [{ label: 'a' }, { label: 'b' }] });
    await call('/endpoints', 'POST', { id: 'tags.list', type: 'crud', collection: 'tags', action: 'list', method: 'GET', path: '/tags' });
    expect((await json(await fetch(`${url}/tags`))).total).toBe(2);
  });

  it('persists admin changes to backend.json', async () => {
    const { dir, call } = await setup();
    await call('/endpoints', 'POST', { id: 'extra', type: 'static', method: 'GET', path: '/extra' });
    const onDisk = JSON.parse(readFileSync(join(dir, 'backend.json'), 'utf8')) as BackendInput;
    expect(onDisk.endpoints?.some((e) => e.id === 'extra')).toBe(true);
    expect(onDisk.port).toBeUndefined(); // written as given, without every default filled in
  });
});

describe('hot reload from disk', () => {
  it('a backend.json edit is picked up after a debounce, with no restart', async () => {
    const { url, dir, backend } = await setup({ debounceMs: 50 });
    const next = structuredClone(base);
    next.endpoints = [...(next.endpoints ?? []), { id: 'fromdisk', type: 'static', method: 'GET', path: '/fromdisk', body: { ok: 1 } }];
    writeFileSync(join(dir, 'backend.json'), JSON.stringify(next));
    await vi.waitFor(async () => expect((await fetch(`${url}/fromdisk`)).status).toBe(200), { timeout: 5000, interval: 50 });
    expect(backend.manager.lastReloadError).toBeUndefined();
  });

  it('refuses an invalid edit and keeps serving the old definition', async () => {
    const { url, dir, backend } = await setup({ debounceMs: 50 });
    writeFileSync(join(dir, 'backend.json'), '{ broken');
    await vi.waitFor(() => expect(backend.manager.lastReloadError).toBeDefined(), { timeout: 5000, interval: 50 });
    expect((await fetch(`${url}/hello`)).status).toBe(200);
  });

  it('refuses an edit that would delete data (it needs confirm from the app)', async () => {
    const { url, dir, backend } = await setup({ debounceMs: 50 });
    const next = structuredClone(base);
    next.collections = [{ name: 'products', fields: [{ name: 'title', type: 'string', required: true }] }];
    writeFileSync(join(dir, 'backend.json'), JSON.stringify(next));
    await vi.waitFor(() => expect(backend.manager.lastReloadError).toMatch(/delete data/), { timeout: 5000, interval: 50 });
    expect(await json(await fetch(`${url}/products/1`))).toMatchObject({ sku: 'A1' });
  });

  it('POST /reload reads the file now', async () => {
    const { url, dir, call } = await setup({ watch: false });
    const next = structuredClone(base);
    next.endpoints = [...(next.endpoints ?? []), { id: 'late', type: 'static', method: 'GET', path: '/late' }];
    writeFileSync(join(dir, 'backend.json'), JSON.stringify(next));
    expect((await fetch(`${url}/late`)).status).toBe(404);
    expect(await json(await call('/reload', 'POST'))).toMatchObject({ ok: true, changed: true });
    expect((await fetch(`${url}/late`)).status).toBe(200);
    expect(await json(await call('/reload', 'POST'))).toMatchObject({ changed: false });
  });
});

describe('in-flight requests', () => {
  it('finish on the old router while the next request uses the new one', async () => {
    const { url, call } = await setup();
    const inFlight = fetch(`${url}/hello`, { headers: { 'x-tempo-scenario': 'slow' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const changed = await call('/endpoints/hello', 'PUT', { id: 'hello', type: 'static', method: 'GET', path: '/hello', body: { v: 2 }, scenarios: { slow: { delayMs: 300 } } });
    expect(changed.status).toBe(200);
    expect(await json(await fetch(`${url}/hello`))).toEqual({ v: 2 });
    expect(await json(await inFlight)).toEqual({ v: 1 });
  });
});
