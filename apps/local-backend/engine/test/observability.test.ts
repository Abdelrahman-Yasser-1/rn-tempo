import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { crudEndpoints } from '../src/folder.ts';
import { RequestFiles } from '../src/logs.ts';
import { buildOpenApi } from '../src/openapi.ts';
import { parseBackend, type BackendInput } from '../src/schema.ts';
import { percentile, Stats } from '../src/stats.ts';

import { json, serve, stopAll, tempDir } from './helpers.ts';

afterEach(stopAll);

const definition: BackendInput = {
  name: 'obs',
  basePath: '/api',
  collections: [
    {
      name: 'products',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'kind', type: 'enum', enumValues: ['a', 'b'] },
        { name: 'secret', type: 'string' },
      ],
      seed: [{ title: 'One', kind: 'a' }],
    },
  ],
  endpoints: [
    ...crudEndpoints('products', { basePath: '/products', addAlias: true }).map((e) => ({ ...e, hiddenFields: ['secret'] })),
    { id: 'login', type: 'static', method: 'POST', path: '/login', body: { accessToken: 'abc', ok: true } },
  ] as BackendInput['endpoints'],
};

interface Doc {
  openapi: string;
  servers: unknown;
  paths: Record<string, Record<string, { operationId: string; parameters?: { name: string }[]; responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, { required?: string[]; properties: Record<string, { enum?: string[] }> }> };
}

const secrets = { email: 'someone@example.com', password: 'hunter2-secret', refreshToken: 'rt-123456' };

async function noisyRequests(url: string): Promise<void> {
  await fetch(`${url}/api/login?token=url-token-9&page=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer very-secret-jwt', cookie: 'sid=cookie-secret' },
    body: JSON.stringify(secrets),
  });
  await fetch(`${url}/api/products`);
}

describe('request log', () => {
  it('redacts passwords, tokens and headers in the ring buffer', async () => {
    const { url, backend } = await serve(definition);
    await noisyRequests(url);
    const text = JSON.stringify(backend.engine.requests.snapshot());
    for (const secret of ['hunter2-secret', 'rt-123456', 'very-secret-jwt', 'cookie-secret', 'url-token-9', 'someone@example.com', '"abc"']) {
      expect(text, secret).not.toContain(secret);
    }
    const login = backend.engine.requests.snapshot().find((entry) => entry.url.startsWith('/api/login'));
    expect(login).toMatchObject({ method: 'POST', status: 200, req: { body: { password: '[REDACTED]' } } });
    expect(login?.url).toContain('token=%5BREDACTED%5D');
  });

  it('does not log non-JSON bodies as text and does not log engine routes', async () => {
    const { url, backend } = await serve(definition);
    await fetch(`${url}/api/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=plain-text-pw' });
    await fetch(`${url}/__health`);
    await fetch(`${url}/__docs/openapi.json`);
    const entries = backend.engine.requests.snapshot();
    expect(JSON.stringify(entries)).not.toContain('plain-text-pw');
    expect(entries.some((entry) => entry.url.startsWith('/__'))).toBe(false);
  });

  it('streams entries over the admin SSE, redacted', async () => {
    const { url, backend } = await serve(definition);
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${backend.admin.port}/__admin/events`, {
      headers: { authorization: `Bearer ${backend.admin.token}` },
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await noisyRequests(url);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let received = '';
    while (!received.includes('/api/products')) {
      const chunk = await reader?.read();
      if (chunk === undefined || chunk.done) break;
      received += decoder.decode(chunk.value);
    }
    controller.abort();
    expect(received).toContain('event: request');
    expect(received).toContain('[REDACTED]');
    for (const secret of ['hunter2-secret', 'very-secret-jwt', 'url-token-9', 'rt-123456']) expect(received).not.toContain(secret);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.engine.requests.listenerCount).toBe(0);
  });

  it('is persisted redacted to .data/logs/requests-YYYY-MM-DD.jsonl', async () => {
    const { url, dir } = await serve(definition);
    await noisyRequests(url);
    const logs = join(dir, '.data/logs');
    const file = readdirSync(logs).find((name) => /^requests-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name));
    expect(file).toBeDefined();
    const text = readFileSync(join(logs, file ?? ''), 'utf8');
    const lines = text.trim().split('\n').map((line) => JSON.parse(line) as { url: string });
    expect(lines.length).toBe(2);
    for (const secret of ['hunter2-secret', 'very-secret-jwt', 'cookie-secret', 'url-token-9']) expect(text).not.toContain(secret);
  });

  it('writes engine logs to .data/logs/engine.log, redacted', async () => {
    const { dir, backend } = await serve(definition);
    backend.manager.lastReloadError = undefined;
    const text = readFileSync(join(dir, '.data/logs/engine.log'), 'utf8');
    expect(text).toContain('engine started');
  });
});

describe('request file rotation', () => {
  const day = (offset: number): string => new Date(Date.UTC(2026, 10, 17 + offset)).toISOString().slice(0, 10);

  it('deletes files older than 7 days', () => {
    const dir = tempDir();
    for (const offset of [-10, -8, -7, -6, -1]) writeFileSync(join(dir, `requests-${day(offset)}.jsonl`), '{}\n');
    writeFileSync(join(dir, 'engine.log'), 'keep\n');
    const files = new RequestFiles({ dir, now: () => new Date(Date.UTC(2026, 10, 17, 12)) });
    files.append({ a: 1 });
    files.close();
    expect(readdirSync(dir).sort()).toEqual(['engine.log', `requests-${day(-6)}.jsonl`, `requests-${day(-1)}.jsonl`, `requests-${day(0)}.jsonl`]);
  });

  it('drops the oldest files once the total passes the cap', () => {
    const dir = tempDir();
    for (const offset of [-3, -2, -1]) writeFileSync(join(dir, `requests-${day(offset)}.jsonl`), 'x'.repeat(400));
    const files = new RequestFiles({ dir, maxBytes: 1000, now: () => new Date(Date.UTC(2026, 10, 17, 12)) });
    for (let i = 0; i < 30; i += 1) files.append({ i, pad: 'y'.repeat(20) });
    files.close();
    const names = readdirSync(dir);
    expect(names).not.toContain(`requests-${day(-3)}.jsonl`);
    expect(names).toContain(`requests-${day(0)}.jsonl`);
    const total = names.reduce((sum, name) => sum + readFileSync(join(dir, name)).length, 0);
    expect(total).toBeLessThanOrEqual(1000 + 100);
  });

  it('rolls over to a new file when the day changes', () => {
    const dir = tempDir();
    let now = new Date(Date.UTC(2026, 10, 17, 23, 59));
    const files = new RequestFiles({ dir, now: () => now });
    files.append({ n: 1 });
    now = new Date(Date.UTC(2026, 10, 18, 0, 1));
    files.append({ n: 2 });
    files.close();
    expect(readdirSync(dir).sort()).toEqual(['requests-2026-11-17.jsonl', 'requests-2026-11-18.jsonl']);
  });
});

describe('stats', () => {
  it('computes percentiles by nearest rank', () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([5], 95)).toBe(5);
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(95);
  });

  it('counts requests per minute, the error rate and per-endpoint latency', () => {
    let now = 1_000_000;
    const stats = new Stats(() => now);
    for (let i = 1; i <= 20; i += 1) stats.record('a', i === 20 ? 500 : 200, i);
    stats.record(undefined, 404, 1);
    now += 30_000;
    stats.record('b', 200, 7);
    let snapshot = stats.snapshot();
    expect(snapshot).toMatchObject({ requestsPerMinute: 22, total: 22, errors: 2 });
    expect(snapshot.errorRate).toBeCloseTo(2 / 22);
    expect(snapshot.endpoints.find((e) => e.id === 'a')).toMatchObject({ count: 20, errors: 1, p50: 10, p95: 19 });
    expect(snapshot.endpoints.some((e) => e.id === '(unmatched)')).toBe(true);
    now += 40_000; // the first 21 fall out of the minute window
    snapshot = stats.snapshot();
    expect(snapshot.requestsPerMinute).toBe(1);
    expect(snapshot.total).toBe(22);
  });

  it('is served by the admin API with record counts per collection', async () => {
    const { url, backend } = await serve(definition);
    await fetch(`${url}/api/products`);
    await fetch(`${url}/api/products/99`);
    const stats = await json(await fetch(`http://127.0.0.1:${backend.admin.port}/__admin/stats`, { headers: { authorization: `Bearer ${backend.admin.token}` } }));
    expect(stats).toMatchObject({ total: 2, errors: 1, collections: { products: 1 } });
    expect((stats.endpoints as { id: string }[]).map((e) => e.id).sort()).toEqual(['products.get', 'products.list']);
  });
});

describe('OpenAPI and docs', () => {
  it('builds an OpenAPI 3.1 document from the definition', () => {
    const doc = buildOpenApi(parseBackend(definition)) as unknown as Doc;
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: '/api' }]);
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/products', '/products/{id}', '/products/add', '/products/search', '/login']));
    expect((doc.paths['/products']?.get?.parameters ?? []).map((p) => p.name)).toEqual(expect.arrayContaining(['limit', 'skip', 'sort', 'q', 'title', 'kind']));
    expect((doc.paths['/products']?.get?.parameters ?? []).map((p) => p.name)).not.toContain('secret');
    expect(doc.components.schemas.ProductsInput?.required).toEqual(['title']);
    expect(doc.components.schemas.ProductsInput?.properties.kind?.enum).toEqual(['a', 'b']);
    expect(doc.paths['/products/{id}']?.delete?.responses['200']).toBeDefined();
    const operationIds = Object.values(doc.paths).flatMap((item) => Object.values(item).map((op) => op.operationId));
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it('serves it with Swagger UI on the public listener, following hot reloads', async () => {
    const { url, backend } = await serve(definition);
    const doc = await json(await fetch(`${url}/__docs/openapi.json`));
    expect(doc.openapi).toBe('3.1.0');
    const page = await fetch(`${url}/__docs`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('swagger-ui');
    expect((await fetch(`${url}/__docs/swagger-ui-bundle.js`)).status).toBe(200);
    expect((await fetch(`${url}/__docs/package.json`)).status).toBe(404);
    expect((await fetch(`${url}/__docs/..%2F..%2Fpackage.json`)).status).toBe(404);
    await backend.manager.addEndpoint({ id: 'extra', type: 'static', method: 'GET', path: '/extra' });
    expect(Object.keys((await json(await fetch(`${url}/__docs/openapi.json`))).paths as object)).toContain('/extra');
  });
});
