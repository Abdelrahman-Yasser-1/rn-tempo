import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { rawCall, startSite, stopTeams, type Answer, type Site } from './team-helpers.ts';

afterEach(stopTeams);

const NO_KEY = 'tlb_notarealkeynotarealkeynotarealkeynotareal1';

async function makeKey(site: Site, scope: string, backend = 'demo'): Promise<string> {
  const made = await site.owner.hub('POST', `/backends/${backend}/api-keys`, { name: scope, scope });
  expect(made.status, made.body).toBe(201);
  return (made.json() as { key: string }).key;
}

const call = (site: Site, method: string, path: string, options: { key?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Answer> =>
  rawCall(site.team.port, {
    method,
    path,
    headers: { ...(options.key === undefined ? {} : { authorization: `Bearer ${options.key}` }), ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...(options.headers ?? {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

interface Made {
  id: string;
  url: string;
  expiresAt: string;
}

async function createSession(site: Site, key: string, body?: unknown): Promise<Made> {
  const answer = await call(site, 'POST', '/b/demo/__sessions', { key, ...(body === undefined ? {} : { body }) });
  expect(answer.status, answer.body).toBe(201);
  return answer.json() as unknown as Made;
}

/** The path of a session URL (`/s/<id>/`) on the test server. */
const pathOf = (made: Made, rest = ''): string => `${new URL(made.url).pathname}${rest}`;

describe('AC-LP-4 CI sessions', () => {
  it('AC-LP-4 creates an isolated copy with an unguessable id, a URL and an expiry (default 30 minutes)', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    expect(made.id).toMatch(/^[0-9a-f]{32}$/);
    expect(made.url).toBe(`http://127.0.0.1:${String(site.team.port)}/s/${made.id}/`);
    expect(Date.parse(made.expiresAt) - site.clock.now).toBe(30 * 60_000);
    const list = await call(site, 'GET', pathOf(made, 'products?limit=1'));
    expect(list.status).toBe(200);
    expect(list.json().total).toBe(2);
    // Two sessions never share an id.
    expect((await createSession(site, key)).id).not.toBe(made.id);
    expect((await createSession(site, key, { ttlSeconds: 3600 })).expiresAt).toBe(new Date(site.clock.now + 3600_000).toISOString());
  });

  it('AC-LP-4 refuses a time to live of 0 or over 6 hours', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    for (const ttlSeconds of [0, 6 * 3600 + 1, -5]) expect((await call(site, 'POST', '/b/demo/__sessions', { key, body: { ttlSeconds } })).status, String(ttlSeconds)).toBe(400);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key, body: { ttlSeconds: '60' } })).status).toBe(400);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key, body: { ttlSeconds: 6 * 3600 } })).status).toBe(201);
  });

  it('AC-LP-4 two parallel sessions write and never see each other, nor the backend they came from', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const [a, b] = await Promise.all([createSession(site, key), createSession(site, key)]);
    const [createdA, createdB] = await Promise.all([
      call(site, 'POST', pathOf(a, 'products'), { body: { title: 'Only in A', price: 1 } }),
      call(site, 'POST', pathOf(b, 'products'), { body: { title: 'Only in B', price: 2 } }),
    ]);
    expect(createdA.status).toBe(201);
    expect(createdB.status).toBe(201);
    const titles = async (path: string): Promise<string[]> => ((await call(site, 'GET', path)).json().products as { title: string }[]).map((row) => row.title);
    expect(await titles(pathOf(a, 'products'))).toContain('Only in A');
    expect(await titles(pathOf(a, 'products'))).not.toContain('Only in B');
    expect(await titles(pathOf(b, 'products'))).toContain('Only in B');
    expect(await titles(pathOf(b, 'products'))).not.toContain('Only in A');
    const source = await titles('/b/demo/products');
    expect(source).not.toContain('Only in A');
    expect(source).not.toContain('Only in B');
    expect(source).toHaveLength(2);
    // A write to the backend after the copy was made does not reach a session either.
    expect((await site.owner.admin('demo', 'POST', '/data/products', { title: 'Later in source', price: 3 })).status).toBe(201);
    expect(await titles(pathOf(a, 'products'))).not.toContain('Later in source');
  });

  it('AC-LP-4 keeps /b and /s apart: a session id is not a backend and a backend name is not a session', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    expect((await call(site, 'GET', `/b/${made.id}/products`)).status).toBe(404);
    expect((await call(site, 'GET', '/s/demo/products')).status).toBe(404);
    expect((await call(site, 'GET', `/s/${'0'.repeat(32)}/products`)).status).toBe(404);
    expect((await call(site, 'GET', `/b/demo/__sessions/${made.id}`, { key })).status).toBe(405);
    expect((await call(site, 'GET', `/b/demo/s/${made.id}/products`)).status).toBe(404);
    // Nothing of the session is reachable through the admin API either.
    expect((await site.owner.admin(made.id, 'GET', '/definition')).status).toBe(404);
    expect((await site.owner.hub('GET', '/backends')).body).not.toContain(made.id);
  });

  it('AC-LP-4 enforces the key scope and the backend of the key', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'products' });
    const sessions = await makeKey(site, 'sessions');
    const admin = await makeKey(site, 'admin');
    const read = await makeKey(site, 'read-definition');
    const pub = await makeKey(site, 'public');
    const elsewhere = await makeKey(site, 'sessions', 'other');
    expect((await call(site, 'POST', '/b/demo/__sessions')).status).toBe(401);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key: NO_KEY })).status).toBe(401);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key: read })).status).toBe(403);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key: pub })).status).toBe(403);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key: elsewhere })).status).toBe(403);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key: sessions })).status).toBe(201);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key: admin })).status).toBe(201);
    // A sessions key opens no admin route.
    expect((await call(site, 'GET', '/__admin/b/demo/definition', { key: sessions })).status).toBe(403);
    // A key of another backend cannot delete this backend's session.
    const made = await createSession(site, sessions);
    expect((await call(site, 'DELETE', `/b/demo/__sessions/${made.id}`, { key: elsewhere })).status).toBe(403);
    expect((await call(site, 'DELETE', `/b/other/__sessions/${made.id}`, { key: elsewhere })).status).toBe(404);
    expect((await call(site, 'DELETE', `/b/demo/__sessions/${made.id}`, { key: read })).status).toBe(403);
    expect((await call(site, 'GET', pathOf(made, 'products?limit=1'))).status).toBe(200);
  });

  it('AC-LP-4 deletes a session on DELETE and removes its database and media folder', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    const folder = join(site.dir, 'data', 'sessions', made.id);
    expect(existsSync(join(folder, '.data', 'db.sqlite'))).toBe(true);
    expect(existsSync(join(folder, '.data', 'media'))).toBe(true);
    expect(site.team.tempSessions.count).toBe(1);
    expect((await call(site, 'DELETE', `/b/demo/__sessions/${made.id}`, { key })).status).toBe(200);
    expect(existsSync(folder)).toBe(false);
    expect(site.team.tempSessions.count).toBe(0);
    expect((await call(site, 'GET', pathOf(made, 'products'))).status).toBe(404);
    expect((await call(site, 'DELETE', `/b/demo/__sessions/${made.id}`, { key })).status).toBe(404);
  });

  it('AC-LP-4 expires a session after its time to live (fake clock), on the next request and in the sweep', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const [soon, later] = [await createSession(site, key, { ttlSeconds: 60 }), await createSession(site, key, { ttlSeconds: 600 })];
    const folders = [soon, later].map((made) => join(site.dir, 'data', 'sessions', made.id));
    site.clock.now += 59_000;
    expect((await call(site, 'GET', pathOf(soon, 'products?limit=1'))).status).toBe(200);
    site.clock.now += 2_000;
    expect((await call(site, 'GET', pathOf(soon, 'products?limit=1'))).status).toBe(404);
    expect(existsSync(folders[0] ?? '')).toBe(false);
    // The sweep removes the ones nobody asked for.
    site.clock.now += 600_000;
    expect(await site.team.tempSessions.sweep()).toBe(1);
    expect(existsSync(folders[1] ?? '')).toBe(false);
    expect(site.team.tempSessions.count).toBe(0);
  });

  it('AC-LP-4 sweeps expired sessions on its own timer', async () => {
    const site = await startSite({ sessionSweepMs: 50 });
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key, { ttlSeconds: 5 });
    site.clock.now += 6_000;
    const folder = join(site.dir, 'data', 'sessions', made.id);
    for (let wait = 0; wait < 60 && existsSync(folder); wait += 1) await new Promise((done) => setTimeout(done, 50));
    expect(existsSync(folder)).toBe(false);
  });

  it('AC-LP-4 limits sessions per backend, per key and in disk, answering 429 with Retry-After', async () => {
    const site = await startSite({ sessionLimits: { perBackend: 3, perKey: 2 } });
    const one = await makeKey(site, 'sessions');
    const two = await makeKey(site, 'sessions');
    const first = await createSession(site, one, { ttlSeconds: 120 });
    await createSession(site, one, { ttlSeconds: 300 });
    const perKey = await call(site, 'POST', '/b/demo/__sessions', { key: one });
    expect(perKey.status).toBe(429);
    expect(perKey.json().detail).toMatch(/This API key already has 2 sessions/);
    expect(Number(perKey.headers['retry-after'])).toBe(120);
    await createSession(site, two);
    const perBackend = await call(site, 'POST', '/b/demo/__sessions', { key: two });
    expect(perBackend.status).toBe(429);
    expect(perBackend.json().detail).toMatch(/already has 3 sessions/);
    expect(Number(perBackend.headers['retry-after'])).toBeGreaterThan(0);
    // Room again once one is deleted.
    expect((await call(site, 'DELETE', `/b/demo/__sessions/${first.id}`, { key: one })).status).toBe(200);
    expect((await call(site, 'POST', '/b/demo/__sessions', { key: two })).status).toBe(201);

    const small = await startSite({ sessionLimits: { totalBytes: 1 } });
    const key = await makeKey(small, 'sessions');
    await createSession(small, key);
    const full = await call(small, 'POST', '/b/demo/__sessions', { key });
    expect(full.status).toBe(429);
    expect(full.json().detail).toMatch(/no room/);
    expect(Number(full.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('AC-LP-4 starts a session in test mode, and a header opts a request out', async () => {
    const site = await startSite();
    const def = (await site.owner.admin('demo', 'GET', '/definition')).json();
    expect((await site.owner.admin('demo', 'PUT', '/definition', { ...def, latency: { default: { fixedMs: 900 } } })).status).toBe(200);
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    let started = performance.now();
    expect((await call(site, 'GET', pathOf(made, 'products/1'))).status).toBe(200);
    expect(performance.now() - started).toBeLessThan(400);
    started = performance.now();
    await call(site, 'GET', pathOf(made, 'products/1'), { headers: { 'x-tempo-test-mode': '0' } });
    expect(performance.now() - started).toBeGreaterThanOrEqual(850);
    // The backend itself is not in test mode.
    started = performance.now();
    await call(site, 'GET', '/b/demo/products/1');
    expect(performance.now() - started).toBeGreaterThanOrEqual(850);
  });

  it('AC-LP-4 copies the definition, data and media, never secrets, app users or sign-in sessions', async () => {
    const site = await startSite();
    const running = site.team.registry.running('demo');
    if (running === undefined) throw new Error('demo is not running');
    const db = running.engine.store.db;
    db.prepare("INSERT INTO _users (username, email, passwordHash, createdAt, updatedAt) VALUES ('alice', 'alice@example.com', 'scrypt$16384$8$1$c2FsdA$aGFzaA', 'x', 'x')").run();
    db.prepare("INSERT INTO _refresh_tokens (userId, tokenHash, family, expiresAt, createdAt) VALUES (1, 'refresh-marker', 'f', 'x', 'x')").run();
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    const live = await site.team.tempSessions.get(made.id);
    if (live === undefined) throw new Error('no session');
    const copy = live.engine.store.db;
    expect(Number(copy.prepare('SELECT COUNT(*) AS n FROM products').get()?.n)).toBe(2);
    expect(Number(copy.prepare('SELECT COUNT(*) AS n FROM _users').get()?.n)).toBe(0);
    expect(Number(copy.prepare('SELECT COUNT(*) AS n FROM _refresh_tokens').get()?.n)).toBe(0);
    expect(live.engine.folder.dir).toBe(join(site.dir, 'data', 'sessions', made.id));
    expect(live.engine.definition.name).toBe('Demo');
    expect(existsSync(join(live.engine.folder.dir, '.data', 'certs', 'key.pem'))).toBe(false);
  });

  it('AC-LP-4 answers sessions with the sandbox headers of /b and never a cookie', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    const answer = await call(site, 'GET', pathOf(made, 'products/1'));
    const reference = await call(site, 'GET', '/b/demo/products/1');
    for (const name of ['content-security-policy', 'x-content-type-options', 'cross-origin-resource-policy', 'referrer-policy']) {
      expect(answer.headers[name], name).toBeDefined();
      expect(answer.headers[name], name).toBe(reference.headers[name]);
    }
    expect(String(answer.headers['content-security-policy'])).toContain('sandbox');
    expect(answer.headers['set-cookie']).toBeUndefined();
  });

  it('AC-LP-4 audits creating and deleting, without the key or the whole session id', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    await call(site, 'DELETE', `/b/demo/__sessions/${made.id}`, { key });
    const audit = await site.owner.hub('GET', '/backends/demo/audit');
    const entries = (audit.json() as unknown as { entries: { action: string; actor: { kind: string; label: string }; target: string; status: number }[] }).entries;
    const create = entries.find((entry) => entry.action === 'session.create');
    const remove = entries.find((entry) => entry.action === 'session.delete');
    expect(create).toMatchObject({ actor: { kind: 'key', label: key.slice(0, 12) }, status: 201, target: `session ${made.id.slice(0, 8)}` });
    expect(remove).toMatchObject({ status: 200, target: `session ${made.id.slice(0, 8)}` });
    expect(audit.body).not.toContain(key);
    expect(audit.body).not.toContain(made.id);
  });

  it('AC-LP-4 removes the sessions of the previous run when the server starts', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'sessions');
    const made = await createSession(site, key);
    const folder = join(site.dir, 'data', 'sessions', made.id);
    expect(existsSync(folder)).toBe(true);
    await site.team.stop();
    expect(existsSync(folder)).toBe(false);
  });
});
