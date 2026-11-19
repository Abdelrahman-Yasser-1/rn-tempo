import { request } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackendRegistry, publicPathOk } from '../src/hub-backends.ts';
import { startWeb, type RunningWeb } from '../src/web.ts';

let dirs: string[] = [];
let sites: { web: RunningWeb; registry: BackendRegistry }[] = [];
const base = 30_000 + Math.floor(Math.random() * 20_000);
let nextPort = base;

beforeEach(() => {
  nextPort += 50;
});
afterEach(async () => {
  for (const site of sites.splice(0)) {
    await site.registry.stopAll();
    await site.web.stop();
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Answer {
  status: number;
  body: string;
  json: () => unknown;
}

/** A browser-like client of the web listener: it signs in with the printed code and sends the cookie, CSRF header and Origin. */
async function open(existing?: string) {
  const dir = existing ?? mkdtempSync(join(tmpdir(), 'lb-hub-'));
  if (existing === undefined) dirs.push(dir);
  const registry = new BackendRegistry(dir, { start: { https: false, host: '127.0.0.1', watch: false }, firstPort: nextPort });
  const web = await startWeb({ host: registry, adminPort: 0 });
  sites.push({ web, registry });
  const origin = `http://127.0.0.1:${String(web.port)}`;
  const call = (method: string, path: string, options: { body?: unknown; raw?: Buffer; headers?: Record<string, string> } = {}): Promise<Answer> =>
    new Promise((resolve, reject) => {
      const payload = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
      const req = request({ host: '127.0.0.1', port: web.port, method, path, headers: { ...(payload === undefined ? {} : { 'content-type': options.raw === undefined ? 'application/json' : 'application/zip' }), ...(options.headers ?? {}) } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, body: text, json: () => JSON.parse(text) as unknown });
        });
      });
      req.once('error', reject);
      req.end(payload);
    });
  const login = await new Promise<{ cookie: string; csrf: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: web.port, method: 'POST', path: '/__session', headers: { 'content-type': 'application/json', origin } }, (res) => {
      let text = '';
      res.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
      res.on('end', () => resolve({ cookie: String(res.headers['set-cookie']).split(';')[0] ?? '', csrf: (JSON.parse(text) as { csrf: string }).csrf }));
    });
    req.once('error', reject);
    req.end(JSON.stringify({ code: web.loginCode }));
  });
  const send = (method: string, path: string, options: { body?: unknown; raw?: Buffer } = {}): Promise<Answer> => call(method, path, { ...options, headers: { cookie: login.cookie, origin, 'x-csrf-token': login.csrf } });
  return { dir, registry, web, send, origin };
}

const status = (answer: Answer): { path: string; name: string; state: string; port: number | null; scheme: string | null; error: string | null } => answer.json() as never;

describe('several backends in one process (AC-LP-1)', () => {
  it('end to end: sign in with the code, create a backend, start it, call its public API, stop it', async () => {
    const { send } = await open();
    const created = await send('POST', '/__hub/backends', { body: { id: 'shop', name: 'Shop', preset: 'tempo-template', port: null } });
    expect(created.status).toBe(201);
    expect(status(created)).toMatchObject({ path: 'shop', name: 'Shop', state: 'stopped', port: null });
    const started = status(await send('POST', '/__hub/backends/shop/start', { body: { port: null } }));
    expect(started).toMatchObject({ state: 'running', scheme: 'http' });
    expect(started.port).toBeGreaterThanOrEqual(base);
    const products = await fetch(`http://127.0.0.1:${String(started.port)}/products?limit=1`);
    expect(products.status).toBe(200);
    const body = (await products.json()) as { products: unknown[]; total: number };
    expect(body.products).toHaveLength(1);
    expect(body.total).toBe(100);
    // The dashboard's admin calls reach this backend through /__admin/b/<id>.
    const definition = await send('GET', '/__admin/b/shop/definition');
    expect(definition.status).toBe(200);
    expect((definition.json() as { name: string }).name).toBe('Shop');
    expect(((await send('GET', '/__hub/backends')).json() as { state: string }[]).map((item) => item.state)).toEqual(['running']);
    expect(status(await send('POST', '/__hub/backends/shop/stop', { body: {} })).state).toBe('stopped');
    await expect(fetch(`http://127.0.0.1:${String(started.port)}/products?limit=1`)).rejects.toThrow();
    expect((await send('GET', '/__admin/b/shop/definition')).status).toBe(409);
  });

  it('keeps every backend isolated: its own port, database, media and logs', async () => {
    const { send, dir } = await open();
    for (const id of ['alpha', 'beta']) {
      expect((await send('POST', '/__hub/backends', { body: { id, name: id, preset: 'tempo-template', port: null } })).status).toBe(201);
    }
    const alpha = status(await send('POST', '/__hub/backends/alpha/start', { body: {} }));
    const beta = status(await send('POST', '/__hub/backends/beta/start', { body: {} }));
    expect(alpha.port).not.toBe(beta.port);
    const before = (await (await fetch(`http://127.0.0.1:${String(beta.port)}/products?limit=1`)).json()) as { total: number };
    // A change in alpha, through the admin API and through its public API...
    const row = await send('POST', '/__admin/b/alpha/data/products', { body: { title: 'Only in alpha', price: 1, category: 'x' } });
    expect([201, 400]).toContain(row.status);
    expect((await send('DELETE', '/__admin/b/alpha/data/products/1')).status).toBe(200);
    const afterAlpha = (await (await fetch(`http://127.0.0.1:${String(alpha.port)}/products?limit=1`)).json()) as { total: number };
    const afterBeta = (await (await fetch(`http://127.0.0.1:${String(beta.port)}/products?limit=1`)).json()) as { total: number };
    expect(afterAlpha.total).toBe(before.total - 1 + (row.status === 201 ? 1 : 0));
    // ...never shows in beta.
    expect(afterBeta.total).toBe(before.total);
    // Media upload into alpha only.
    const upload = await send('POST', '/__admin/b/alpha/media?name=a.txt', { raw: Buffer.from('hello') });
    expect(upload.status).toBe(201);
    const media = (id: string) => (send('GET', `/__admin/b/${id}/media`).then((answer) => (answer.json() as { total: number }).total));
    expect(await media('alpha')).toBe(1);
    expect(await media('beta')).toBe(0);
    // Separate folders, database files and logs on disk.
    for (const id of ['alpha', 'beta']) {
      expect(existsSync(join(dir, id, 'backend.json'))).toBe(true);
      expect(readdirSync(join(dir, id, '.data')).some((name) => name.startsWith('db.sqlite'))).toBe(true);
    }
    expect(existsSync(join(dir, 'alpha', '.data', 'media'))).toBe(true);
    const files = (id: string): number => (existsSync(join(dir, id, '.data', 'media')) ? readdirSync(join(dir, id, '.data', 'media'), { recursive: true }).length : 0);
    expect(files('alpha')).toBeGreaterThan(files('beta'));
    // Each backend's request log holds only its own requests.
    const logs = async (id: string) => ((await send('GET', `/__admin/b/${id}/requests`)).json() as { url: string }[]).map((entry) => entry.url);
    expect((await logs('beta')).every((url) => url.startsWith('/products'))).toBe(true);
    expect((await logs('alpha')).some((url) => url.includes('/media'))).toBe(false);
    // Stopping one leaves the other serving.
    await send('POST', '/__hub/backends/alpha/stop', { body: {} });
    expect((await fetch(`http://127.0.0.1:${String(beta.port)}/products?limit=1`)).status).toBe(200);
  });

  it('assigns each new backend its own free port from the first one', async () => {
    const { send, registry } = await open();
    const ports: number[] = [];
    for (const id of ['one', 'two', 'three']) {
      await send('POST', '/__hub/backends', { body: { id, name: id, preset: 'empty', port: null } });
      ports.push(registry.status(id).port ?? JSON.parse(readFileSync(join(registry.dir, id, 'backend.json'), 'utf8')).port);
    }
    expect(new Set(ports).size).toBe(3);
    expect(Math.min(...ports)).toBeGreaterThanOrEqual(base);
  });

  it('removes a backend from the list without deleting its folder, and opens it again', async () => {
    const { send, dir } = await open();
    await send('POST', '/__hub/backends', { body: { id: 'keep', name: 'keep', preset: 'empty', port: null } });
    await send('POST', '/__hub/backends/keep/start', { body: {} });
    expect((await send('DELETE', '/__hub/backends/keep')).status).toBe(200);
    expect(existsSync(join(dir, 'keep', 'backend.json'))).toBe(true);
    expect((await send('GET', '/__hub/backends')).json()).toEqual([]);
    expect((await send('GET', '/__hub/unlisted')).json()).toEqual(['keep']);
    expect((await send('GET', '/__admin/b/keep/definition')).status).toBe(404);
    expect(status(await send('POST', '/__hub/backends/open', { body: { name: 'keep' } }))).toMatchObject({ path: 'keep', state: 'stopped' });
    expect((await send('GET', '/__hub/unlisted')).json()).toEqual([]);
  });

  it('lists the folders again after a restart, and ignores folders that hold no backend', async () => {
    const first = await open();
    await first.send('POST', '/__hub/backends', { body: { id: 'persisted', name: 'persisted', preset: 'empty', port: null } });
    await first.registry.stopAll();
    await first.web.stop();
    sites.pop();
    const second = await open(first.dir);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(first.dir, 'not-a-backend'));
    expect(((await second.send('GET', '/__hub/backends')).json() as { path: string }[]).map((item) => item.path)).toEqual(['persisted']);
  });

  it('refuses bad names, existing folders and unknown backends', async () => {
    const { send } = await open();
    for (const id of ['../escape', 'A', '.hub', 'a/b', '', 'x'.repeat(60), 'a b']) {
      expect((await send('POST', '/__hub/backends', { body: { id, name: 'x', preset: 'empty', port: null } })).status, id).toBe(400);
    }
    expect((await send('POST', '/__hub/backends', { body: { id: 'dup', name: 'dup', preset: 'empty', port: null } })).status).toBe(201);
    expect((await send('POST', '/__hub/backends', { body: { id: 'dup', name: 'dup', preset: 'empty', port: null } })).status).toBe(409);
    expect((await send('POST', '/__hub/backends', { body: { id: 'bad-preset', name: 'x', preset: 'nope', port: null } })).status).toBe(400);
    expect((await send('POST', '/__hub/backends/missing/start', { body: {} })).status).toBe(404);
    expect((await send('POST', '/__hub/backends/open', { body: { name: 'missing' } })).status).toBe(404);
    expect((await send('GET', '/__admin/b/missing/info')).status).toBe(404);
  });

  it('says plainly when a port is already in use, and the backend shows the error', async () => {
    const { send } = await open();
    await send('POST', '/__hub/backends', { body: { id: 'a1', name: 'a1', preset: 'empty', port: null } });
    const one = status(await send('POST', '/__hub/backends/a1/start', { body: {} }));
    await send('POST', '/__hub/backends', { body: { id: 'a2', name: 'a2', preset: 'empty', port: null } });
    const clash = await send('POST', '/__hub/backends/a2/start', { body: { port: one.port } });
    expect(clash.status).toBe(409);
    expect(clash.body).toContain('already in use');
    const listed = (await send('GET', '/__hub/backends')).json() as { path: string; state: string; error: string | null }[];
    expect(listed.find((item) => item.path === 'a2')).toMatchObject({ state: 'error' });
  });

  it('creates a handler file, reads the engine log and the certificate state', async () => {
    const { send, dir } = await open();
    await send('POST', '/__hub/backends', { body: { id: 'tools', name: 'tools', preset: 'empty', port: null } });
    await send('POST', '/__hub/backends/tools/start', { body: {} });
    expect((await send('POST', '/__hub/backends/tools/handlers', { body: { name: 'hello.js' } })).json()).toEqual({ file: 'handlers/hello.js' });
    expect(readFileSync(join(dir, 'tools', 'handlers', 'hello.js'), 'utf8')).toContain('export default');
    expect((await send('POST', '/__hub/backends/tools/handlers', { body: { name: 'hello.js' } })).status).toBe(409);
    for (const name of ['../x.js', 'a/b.js', 'x.ts', '.js', 'a..b.js']) expect((await send('POST', '/__hub/backends/tools/handlers', { body: { name } })).status, name).toBe(400);
    const log = (await send('GET', '/__hub/backends/tools/engine-log')).json() as string[];
    expect(log.some((line) => line.includes('engine started'))).toBe(true);
    expect((await send('GET', '/__hub/backends/tools/cert-info')).json()).toMatchObject({ hasCert: false, hasCa: false });
  });

  it('tries the public API for the dashboard, and only ordinary public paths', async () => {
    const { send } = await open();
    await send('POST', '/__hub/backends', { body: { id: 'try', name: 'try', preset: 'tempo-template', port: null } });
    expect((await send('POST', '/__hub/backends/try/try', { body: { method: 'GET', path: '/products?limit=1' } })).status).toBe(409);
    await send('POST', '/__hub/backends/try/start', { body: {} });
    const reply = (await send('POST', '/__hub/backends/try/try', { body: { method: 'GET', path: '/products?limit=1', headers: [['accept', 'application/json'], ['cookie', 'no']] } })).json() as { status: number; body: string; contentType: string };
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toMatchObject({ total: 100 });
    for (const path of ['/__admin/definition', '/../x', '//evil.test/x', '/a%2f..%2fb', '/x#y', 'products', '/a\\b']) {
      expect((await send('POST', '/__hub/backends/try/try', { body: { method: 'GET', path } })).status, path).toBe(400);
    }
    expect((await send('POST', '/__hub/backends/try/try', { body: { method: 'TRACE', path: '/' } })).status).toBe(400);
    expect(publicPathOk('/products/1?x=1')).toBe(true);
  });

  it('restores a backup into a new folder, never over an existing one', async () => {
    const { send, dir } = await open();
    await send('POST', '/__hub/backends', { body: { id: 'src', name: 'Source', preset: 'tempo-template', port: null } });
    await send('POST', '/__hub/backends/src/start', { body: {} });
    const snapshot = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const web = sites[0]?.web;
      const req = request({ host: '127.0.0.1', port: web?.port, path: '/__admin/b/src/snapshot', headers: { authorization: `Bearer ${web?.hub.token ?? ''}` } }, (res) => {
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.once('error', reject);
      req.end();
    });
    expect(snapshot.subarray(0, 2).toString()).toBe('PK');
    const restored = await send('POST', '/__hub/restore?name=copy', { raw: snapshot });
    expect(restored.status).toBe(200);
    expect(status(restored)).toMatchObject({ path: 'copy', name: 'Source', state: 'stopped' });
    expect(existsSync(join(dir, 'copy', 'backend.json'))).toBe(true);
    expect((await send('POST', '/__hub/restore?name=copy', { raw: snapshot })).status).toBe(409);
    expect((await send('POST', '/__hub/restore?name=../bad', { raw: snapshot })).status).toBe(400);
    expect((await send('POST', '/__hub/restore?name=junk', { raw: Buffer.from('not a zip') })).status).toBe(400);
    expect(existsSync(join(dir, 'junk'))).toBe(false);
  });
});
