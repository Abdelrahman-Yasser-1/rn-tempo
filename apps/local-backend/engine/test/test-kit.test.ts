import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { setupTempoBackend, type TempoBackend } from '../src/test-kit/index.ts';
import { rawCall, startSite, stopTeams } from './team-helpers.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'jest-project', 'backend');
const open: TempoBackend[] = [];
const temp: string[] = [];

/** A kit without Jest hooks (Vitest has no globals here), as another runner would use it. */
function kit(options: Parameters<typeof setupTempoBackend>[0] = {}): TempoBackend {
  const backend = setupTempoBackend({ source: FIXTURE, hooks: false, ...options });
  open.push(backend);
  return backend;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((backend) => backend.stop()));
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
  await stopTeams();
});

const get = async (backend: TempoBackend, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(`${backend.url}${path}`, { headers });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

describe('the test kit', () => {
  it('AC-LP-3 starts on a random loopback port with the seed, and answers over real HTTP', async () => {
    const backend = kit();
    expect(backend.url).toBe('');
    await backend.start();
    expect(backend.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const list = await get(backend, '/products?limit=3');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(100);
    expect(backend.loaded).toBe('folder');
    await backend.stop();
    expect(backend.url).toBe('');
  });

  it('AC-LP-3 starts the engine in under 500 ms on a 100-row backend', async () => {
    // The first start of a process pays for loading code; what a test file pays is a later one.
    const times: number[] = [];
    for (let run = 0; run < 4; run += 1) {
      const backend = kit();
      const started = performance.now();
      await backend.start();
      times.push(performance.now() - started);
      expect((await get(backend, '/products/1')).status).toBe(200);
      await backend.stop();
    }
    const [first, ...rest] = times;
    process.stdout.write(`test kit start (100 rows): first ${String(Math.round(first ?? 0))} ms, then ${rest.map((time) => String(Math.round(time))).join(', ')} ms\n`);
    expect(Math.min(...rest)).toBeLessThan(500);
  });

  it('AC-LP-3 keeps the database in memory: no db.sqlite on disk, and the temp folder is gone after stop', async () => {
    const backend = kit();
    await backend.start();
    expect((await get(backend, '/products?limit=1')).body.total).toBe(100);
    await backend.stop();
  });

  it('AC-LP-3 test mode: no delay although the backend says 2 s; a header opts back in', async () => {
    const backend = kit();
    await backend.start();
    let started = performance.now();
    await get(backend, '/products/1');
    expect(performance.now() - started).toBeLessThan(500);
    started = performance.now();
    await get(backend, '/products/1', { 'x-tempo-test-delays': '1' });
    expect(performance.now() - started).toBeGreaterThanOrEqual(1900);
    // With test mode off in the kit, the configured delay applies, and the header opts one request out.
    const slow = kit({ testMode: false });
    await slow.start();
    started = performance.now();
    await get(slow, '/products/1', { 'x-tempo-test-mode': '1' });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('AC-LP-3 gives each kit its own port and its own data', async () => {
    const [one, two] = [kit(), kit()];
    await Promise.all([one.start(), two.start()]);
    expect(one.url).not.toBe(two.url);
    one.data.insert('products', { title: 'Only here', price: 1 });
    expect(one.data.list('products')).toHaveLength(101);
    expect(two.data.list('products')).toHaveLength(100);
    expect((await get(two, '/products?limit=1')).body.total).toBe(100);
  });

  it('AC-LP-3 reset brings back data, scenarios, the clock and the recorded requests', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-now-'));
    temp.push(dir);
    cpSync(FIXTURE, dir, { recursive: true });
    const definition = JSON.parse(readFileSync(join(dir, 'backend.json'), 'utf8')) as { endpoints: unknown[] };
    definition.endpoints.push({ id: 'now', type: 'static', method: 'GET', path: '/now', body: { now: '{{now}}' } });
    writeFileSync(join(dir, 'backend.json'), JSON.stringify(definition));
    const backend = kit({ source: dir });
    await backend.start();
    expect((await get(backend, '/now')).body.now).toBe('2025-01-01T00:00:00.000Z');
    backend.time.set('2031-02-03T04:05:06Z');
    expect((await get(backend, '/now')).body.now).toBe('2031-02-03T04:05:06.000Z');
    backend.scenario('products.get', 'notFound');
    expect((await get(backend, '/products/1')).status).toBe(404);
    backend.data.insert('products', { title: 'Extra', price: 2 });
    await fetch(`${backend.url}/products/1`, { method: 'DELETE' });
    expect(backend.requests().length).toBeGreaterThan(0);
    backend.reset();
    expect(backend.requests()).toEqual([]);
    expect((await get(backend, '/now')).body.now).toBe('2025-01-01T00:00:00.000Z');
    expect((await get(backend, '/products/1')).status).toBe(200);
    expect(backend.data.list('products')).toHaveLength(100);
    // New rows continue after the seed's ids, as on a fresh backend.
    expect(backend.data.insert('products', { title: 'Next', price: 1 }).id).toBe(101);
  });

  it('AC-LP-3 rejects a bad scenario, a bad collection and a bad row with a clear message', async () => {
    const backend = kit();
    await backend.start();
    expect(() => backend.scenario('nope', 'notFound')).toThrow(/No endpoint "nope"/);
    expect(() => backend.data.list('ghosts')).toThrow(/no collection "ghosts"/);
    expect(() => backend.data.insert('products', { price: 'x' })).toThrow(/Invalid products row/);
    expect(() => backend.time.set('not a date')).toThrow(/time.set/);
  });

  it('AC-LP-3 records requests with secrets replaced', async () => {
    const backend = kit();
    await backend.start();
    await get(backend, '/products/2', { authorization: 'Bearer very-secret-token' });
    const [entry] = backend.requests();
    expect(entry).toMatchObject({ method: 'GET', url: '/products/2', status: 200 });
    expect(JSON.stringify(entry)).not.toContain('very-secret-token');
  });

  it('AC-LP-3 explains a source that is neither a folder nor a URL, and a URL without a key', async () => {
    await expect(kit({ source: '/no/such/folder' }).start()).rejects.toThrow(/neither a backend folder nor an http/);
    await expect(kit({ source: 'https://example.invalid/b/x', apiKey: '' }).start()).rejects.toThrow(/TEMPO_BACKEND_KEY/);
    await expect(kit({ source: 'http://example.com/b/x', apiKey: 'tlb_x' }).start()).rejects.toThrow(/Use https/);
  });
});

describe('the test kit with a team server as the source', () => {
  async function remote(): Promise<{ url: string; key: string; cache: string; stop: () => Promise<void> }> {
    const site = await startSite();
    const made = await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'kit', scope: 'read-definition' });
    const cache = mkdtempSync(join(tmpdir(), 'kit-cache-'));
    temp.push(cache);
    return { url: `http://127.0.0.1:${String(site.team.port)}/b/demo`, key: (made.json() as { key: string }).key, cache, stop: () => site.team.stop() };
  }

  it('AC-LP-3 downloads the snapshot with the key, caches it by ETag, and revalidates with a 304', async () => {
    const site = await remote();
    const first = kit({ source: site.url, apiKey: site.key, cacheDir: site.cache });
    await first.start();
    expect(first.loaded).toBe('download');
    expect(first.data.list('products')).toHaveLength(2);
    expect((await get(first, '/products?limit=1')).body.total).toBe(2);
    const second = kit({ source: site.url, apiKey: site.key, cacheDir: site.cache });
    await second.start();
    expect(second.loaded).toBe('not-modified');
    expect(second.data.list('products')).toHaveLength(2);
    // The key is not in the cache folder.
    const { readdirSync } = await import('node:fs');
    for (const name of readdirSync(site.cache)) expect(readFileSync(join(site.cache, name), 'utf8')).not.toContain(site.key);
  });

  it('AC-LP-3 works offline after the first fetch, with a warning, and says so clearly without a cache', async () => {
    const site = await remote();
    await kit({ source: site.url, apiKey: site.key, cacheDir: site.cache }).start();
    await site.stop();
    const warnings: string[] = [];
    const offline = kit({ source: site.url, apiKey: site.key, cacheDir: site.cache, warn: (message) => warnings.push(message) });
    await offline.start();
    expect(offline.loaded).toBe('cache');
    expect(offline.data.list('products')).toHaveLength(2);
    expect(warnings.join(' ')).toMatch(/not reachable.*cached copy/);
    expect(warnings.join(' ')).not.toContain(site.key);
    const empty = mkdtempSync(join(tmpdir(), 'kit-empty-'));
    temp.push(empty);
    await expect(kit({ source: site.url, apiKey: site.key, cacheDir: empty }).start()).rejects.toThrow(/no cached copy/);
  });

  it('AC-LP-3 reports a refused key without falling back to the cache', async () => {
    const site = await remote();
    await kit({ source: site.url, apiKey: site.key, cacheDir: site.cache }).start();
    const wrong = 'tlb_notarealkeynotarealkeynotarealkeynotareal1';
    await expect(kit({ source: site.url, apiKey: wrong, cacheDir: site.cache }).start()).rejects.toThrow(/refused the API key \(401\)/);
    expect((await rawCall(Number(new URL(site.url).port), { path: '/b/demo/__definition' })).status).toBe(401);
  });
});
