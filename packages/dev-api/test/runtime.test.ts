import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApiError, defineConfig, defineEndpoint, resource } from '@rn-tempo/api-contract';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createRuntime, parseQuery, toMswHandlers } from '../src/runtime/index.ts';

const runtimeDir = join(dirname(fileURLToPath(import.meta.url)), '../src/runtime');

describe('runtime entry has no Node imports', () => {
  it('only imports the contract, zod and its own files', () => {
    const allowed = new Set(['@rn-tempo/api-contract', 'zod']);
    const bad: string[] = [];
    for (const name of readdirSync(runtimeDir)) {
      const text = readFileSync(join(runtimeDir, name), 'utf8');
      for (const [, specifier] of text.matchAll(/(?:from|import)\s+'([^']+)'/g)) {
        if (specifier === undefined || specifier.startsWith('./') || allowed.has(specifier)) continue;
        bad.push(`${name}: ${specifier}`);
      }
      expect(text, name).not.toMatch(/\bprocess\.|\bBuffer\b|structuredClone|require\(/);
    }
    expect(bad).toEqual([]);
  });
});

const Item = z.object({ id: z.number(), title: z.string() });
const list = defineEndpoint({
  method: 'GET',
  path: '/items',
  query: z.object({ limit: z.coerce.number().int().min(1).optional() }),
  response: z.object({ items: z.array(Item) }),
  data: ({ query }) => ({ items: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }].slice(0, query.limit ?? 10) }),
});
const one = defineEndpoint({
  method: 'GET',
  path: '/items/:id',
  params: z.object({ id: z.string() }),
  response: Item,
  data: ({ params }) => {
    if (params.id !== '1') throw new ApiError(404, `Item '${params.id}' not found`);
    return { id: 1, title: 'a' };
  },
  scenarios: { teapot: { status: 418, body: { message: 'teapot' } } },
});
const search = defineEndpoint({
  method: 'GET',
  path: '/items/search',
  response: z.object({ found: z.boolean() }),
  data: () => ({ found: true }),
});
const secret = defineEndpoint({
  method: 'GET',
  path: '/secret',
  auth: 'bearer',
  response: z.object({ ok: z.boolean() }),
  data: () => ({ ok: true }),
});
const noData = defineEndpoint({ method: 'GET', path: '/nodata', response: z.object({ n: z.number() }) });
const bad = defineEndpoint({
  method: 'GET',
  path: '/bad',
  response: z.object({ n: z.number() }),
  data: () => ({ n: 'x' }) as unknown as { n: number },
});

const config = defineConfig({ endpoints: [one, list, search, secret, noData, bad], basePath: '/v1', auth: true });

describe('createRuntime', () => {
  const runtime = createRuntime(config, { sleep: () => Promise.resolve() });

  it('matches static segments before params, under the base path', async () => {
    expect(runtime.matches('GET', '/v1/items/search')).toBe(true);
    expect(runtime.matches('GET', '/items/search')).toBe(false);
    const res = await runtime.resolve({ method: 'GET', path: '/v1/items/search' });
    expect(res).toMatchObject({ status: 200, body: { found: true } });
  });

  it('validates the query and coerces it', async () => {
    const ok = await runtime.resolve({ method: 'GET', path: '/v1/items', query: { limit: '1' } });
    expect(ok.body).toEqual({ items: [{ id: 1, title: 'a' }] });
    const invalid = await runtime.resolve({ method: 'GET', path: '/v1/items', query: { limit: '0' } });
    expect(invalid.status).toBe(400);
    expect(invalid.headers['content-type']).toBe('application/problem+json');
  });

  it('turns an ApiError into problem+json with a message field', async () => {
    const res = await runtime.resolve({ method: 'GET', path: '/v1/items/9' });
    expect(res).toMatchObject({ status: 404, body: { status: 404, detail: "Item '9' not found", message: "Item '9' not found" } });
  });

  it('picks a scenario from the header', async () => {
    const res = await runtime.resolve({ method: 'GET', path: '/v1/items/1', headers: { 'x-tempo-scenario': 'teapot' } });
    expect(res).toMatchObject({ status: 418, body: { message: 'teapot' } });
    const unknown = await runtime.resolve({ method: 'GET', path: '/v1/items/1', headers: { 'x-tempo-scenario': 'nope' } });
    expect(unknown.status).toBe(400);
  });

  it('waits for a delay scenario through the injected sleep', async () => {
    const waits: number[] = [];
    const slow = createRuntime(config, { sleep: (ms) => (waits.push(ms), Promise.resolve()) });
    await slow.resolve({ method: 'GET', path: '/v1/items/1', headers: { 'x-tempo-scenario': 'slow' } });
    expect(waits).toEqual([3000]);
  });

  it('checks the bearer token issued by the mock login', async () => {
    const denied = await runtime.resolve({ method: 'GET', path: '/v1/secret' });
    expect(denied).toMatchObject({ status: 401, headers: { 'www-authenticate': 'Bearer' } });
    const login = await runtime.resolve({
      method: 'POST',
      path: '/v1/auth/login',
      body: { username: 'emilys', password: 'emilyspass' },
    });
    const token = (login.body as { accessToken: string }).accessToken;
    const allowed = await runtime.resolve({ method: 'GET', path: '/v1/secret', headers: { authorization: `Bearer ${token}` } });
    expect(allowed.status).toBe(200);
  });

  it('answers 404 for an unknown route and 500 when data is missing or wrong', async () => {
    expect((await runtime.resolve({ method: 'GET', path: '/v1/nope' })).status).toBe(404);
    const missing = await runtime.resolve({ method: 'GET', path: '/v1/nodata' });
    expect(missing).toMatchObject({ status: 500, body: { title: 'Endpoint data failed' } });
    const errors: string[] = [];
    const logged = createRuntime(config, { onError: (_f, message) => errors.push(message) });
    const wrong = await logged.resolve({ method: 'GET', path: '/v1/bad' });
    expect(wrong).toMatchObject({ status: 500, body: { title: 'Response does not match its schema' } });
    expect(errors).toEqual(['response does not match its schema']);
  });

  it('keeps a resource in memory when its items are listed, and asks for a server when they are generated', async () => {
    const listed = resource('notes', z.object({ id: z.number(), text: z.string() }), { seed: [{ id: 1, text: 'hi' }] });
    const memory = createRuntime(defineConfig({ endpoints: [listed] }));
    const created = await memory.resolve({ method: 'POST', path: '/notes/add', body: { text: 'yo' } });
    expect(created.status).toBe(201);
    const all = await memory.resolve({ method: 'GET', path: '/notes' });
    expect(JSON.stringify(all.body)).toContain('yo');

    const generated = resource('things', z.object({ id: z.number() }), { seed: 3 });
    const res = await createRuntime(defineConfig({ endpoints: [generated] })).resolve({ method: 'GET', path: '/things' });
    expect(res).toMatchObject({ status: 500 });
    expect(JSON.stringify(res.body)).toContain('needs the dev API server');
  });
});

describe('parseQuery', () => {
  it('decodes, keeps repeated keys as arrays and accepts a leading ?', () => {
    expect(parseQuery('?q=a%20b&tag=1&tag=2&flag')).toEqual({ q: 'a b', tag: ['1', '2'], flag: '' });
  });
});

describe('toMswHandlers', () => {
  it('registers one wildcard-host handler per endpoint in match order and answers through the runtime', async () => {
    const registered: { method: string; path: string }[] = [];
    type Resolver = (info: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => Promise<Response>;
    const resolvers: Resolver[] = [];
    const http = Object.fromEntries(
      ['get', 'post', 'put', 'patch', 'delete'].map((method) => [
        method,
        (path: string, resolver: Resolver) => {
          registered.push({ method, path });
          resolvers.push(resolver);
          return { method, path };
        },
      ]),
    ) as Parameters<typeof toMswHandlers>[1]['http'];
    const handlers = toMswHandlers(config, { http, HttpResponse: Response as unknown as Parameters<typeof toMswHandlers>[1]['HttpResponse'] });
    expect(handlers).toHaveLength(registered.length);
    const searchIndex = registered.findIndex((r) => r.path === '*/v1/items/search');
    const oneIndex = registered.findIndex((r) => r.path === '*/v1/items/:id');
    expect(searchIndex).toBeGreaterThanOrEqual(0);
    expect(searchIndex).toBeLessThan(oneIndex);

    const response = await resolvers[searchIndex]?.({ request: new Request('https://any.host.test/v1/items/search?x=1'), params: {} });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ found: true });

    // The `*` host pattern also matches a URL with a path prefix; the handler still answers.
    const prefixed = await resolvers[oneIndex]?.({ request: new Request('https://any.host.test/api/v1/v1/items/1'), params: { id: '1' } });
    expect(prefixed?.status).toBe(200);
    expect(await prefixed?.json()).toEqual({ id: 1, title: 'a' });
  });

  it('can keep only some endpoints', () => {
    const http = new Proxy({}, { get: () => (path: string) => path }) as Parameters<typeof toMswHandlers>[1]['http'];
    const only = toMswHandlers(config, { http, HttpResponse: Response as never }, { filter: (e) => e.path === '/secret' });
    expect(only).toEqual(['*/v1/secret']);
  });
});


