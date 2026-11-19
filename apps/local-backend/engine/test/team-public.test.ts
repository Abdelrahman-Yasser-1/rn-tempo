import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startBackend } from '../src/app.ts';
import { buildOpenApi } from '../src/openapi.ts';
import { parseBackend } from '../src/schema.ts';

import { rawCall, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

async function setAccess(site: Site, mode: 'open' | 'key'): Promise<void> {
  const def = (await site.owner.admin('demo', 'GET', '/definition')).json();
  const put = await site.owner.admin('demo', 'PUT', '/definition', { ...def, publicAccess: mode });
  expect(put.status, put.body).toBe(200);
}

const publicCall = (site: Site, path: string, key?: string, method = 'GET') => rawCall(site.team.port, { method, path, ...(key === undefined ? {} : { headers: { 'x-tempo-access-key': key } }) });

describe('AC-LP-2 /b/<id> routing', () => {
  it('AC-LP-2 answers a backend public API under /b/<id> on the server port', async () => {
    const site = await startSite();
    const list = await publicCall(site, '/b/demo/products');
    expect(list.status, list.body).toBe(200);
    expect(Array.isArray(list.json().products)).toBe(true);
    expect((await publicCall(site, '/b/demo/products?limit=2')).json().limit).toBe(2);
    expect((await publicCall(site, '/b/nope/products')).status).toBe(404);
    expect((await publicCall(site, '/b/Bad%20Id/products')).status).toBe(404);
    // The engine's own paths are not reachable without the prefix.
    expect((await publicCall(site, '/products')).status).toBe(404);
    const health = await publicCall(site, '/b/demo/__health');
    expect(health.status).toBe(200);
    expect(health.json().name).toBe('Demo');
  });

  it('AC-LP-2 shows the prefix in the OpenAPI document, the docs page and media URLs', async () => {
    const site = await startSite();
    const doc = (await publicCall(site, '/b/demo/__docs/openapi.json')).json() as { servers: { url: string }[] };
    expect(doc.servers).toEqual([{ url: '/b/demo' }]);
    const page = await publicCall(site, '/b/demo/__docs');
    expect(page.body).toContain('/b/demo/__docs/swagger-ui.css');
    expect((await publicCall(site, '/b/demo/__docs/swagger-initializer.js')).body).toContain("url: '/b/demo/__docs/openapi.json'");
    const admin = (await site.owner.admin('demo', 'GET', '/openapi')).json() as { servers: { url: string }[] };
    expect(admin.servers).toEqual([{ url: '/b/demo' }]);
    const running = site.team.registry.running('demo');
    expect(running?.engine.mediaUrl('abc', 'https://tempo.example.com')).toBe('https://tempo.example.com/b/demo/media/abc');
    // Without a mount (desktop, local) nothing changes.
    const def = parseBackend({ name: 'x', basePath: '/api' });
    expect((buildOpenApi(def).servers as { url: string }[])[0]?.url).toBe('/api');
    expect((buildOpenApi(def, { prefix: '/b/x' }).servers as { url: string }[])[0]?.url).toBe('/b/x/api');
  });

  it('AC-LP-2 builds absolute URLs from the scheme a trusted proxy reports', async () => {
    const site = await startSite({ trustProxy: ['private'] });
    const reply = await rawCall(site.team.port, { path: '/b/demo/products?limit=1', headers: { 'x-forwarded-proto': 'https', host: 'tempo.example.com' } });
    expect(reply.status).toBe(200);
  });
});

describe('AC-LP-2 public access key', () => {
  it('AC-LP-2 is open by default and needs a public key once the backend asks for one', async () => {
    const site = await startSite();
    expect((await publicCall(site, '/b/demo/products')).status).toBe(200);
    await setAccess(site, 'key');
    expect((await publicCall(site, '/b/demo/products')).status).toBe(401);
    expect((await publicCall(site, '/b/demo/products', 'tlb_nope')).status).toBe(401);
    const made = (await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'app', scope: 'public' })).json() as { key: string; record: { id: number } };
    expect((await publicCall(site, '/b/demo/products', made.key)).status).toBe(200);
    // The health check stays open for the container's HEALTHCHECK.
    expect((await publicCall(site, '/b/demo/__health')).status).toBe(200);
    // Revoking stops it at once.
    await site.owner.hub('DELETE', `/backends/demo/api-keys/${String(made.record.id)}`);
    expect((await publicCall(site, '/b/demo/products', made.key)).status).toBe(401);
  });

  it('AC-LP-2 accepts only a key of scope public, made for that backend', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'products' });
    await setAccess(site, 'key');
    const admin = (await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'ci', scope: 'admin' })).json() as { key: string };
    expect((await publicCall(site, '/b/demo/products', admin.key)).status).toBe(401);
    const otherKey = (await site.owner.hub('POST', '/backends/other/api-keys', { name: 'o', scope: 'public' })).json() as { key: string };
    expect((await publicCall(site, '/b/demo/products', otherKey.key)).status).toBe(401);
    expect((await publicCall(site, '/b/other/products', otherKey.key)).status).toBe(200);
  });

  it('AC-LP-2 describes the key in the OpenAPI document', async () => {
    const site = await startSite();
    await setAccess(site, 'key');
    const doc = (await site.owner.admin('demo', 'GET', '/openapi')).json() as { security: unknown; components: { securitySchemes: Record<string, unknown> } };
    expect(doc.components.securitySchemes.accessKey).toEqual({ type: 'apiKey', in: 'header', name: 'x-tempo-access-key' });
    expect(doc.security).toEqual([{ accessKey: [] }]);
  });

  it('AC-LP-2 lets a signed-in member Try it without a key, and keeps per-port serving for local use', async () => {
    const site = await startSite();
    await setAccess(site, 'key');
    const tried = await site.owner.hub('POST', '/backends/demo/try', { method: 'GET', path: '/products?limit=1' });
    expect(tried.status).toBe(200);
    expect((tried.json() as { status: number }).status).toBe(200);
    // One port per backend still works for the desktop and local modes; a keyed backend never falls back to open there.
    const dir = mkdtempSync(join(tmpdir(), 'lb-port-'));
    try {
      writeFileSync(join(dir, 'backend.json'), JSON.stringify({ name: 'solo', publicAccess: 'key', endpoints: [{ id: 'ping', method: 'GET', path: '/ping', type: 'static', status: 200, body: { ok: true } }] }));
      const solo = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, adminListener: false });
      expect((await rawCall(solo.port, { path: '/ping' })).status).toBe(401);
      expect((await rawCall(solo.port, { path: '/__health' })).status).toBe(200);
      await solo.stop();
      writeFileSync(join(dir, 'backend.json'), JSON.stringify({ name: 'solo', endpoints: [{ id: 'ping', method: 'GET', path: '/ping', type: 'static', status: 200, body: { ok: true } }] }));
      const open = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, adminListener: false });
      expect((await rawCall(open.port, { path: '/ping' })).status).toBe(200);
      await open.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
