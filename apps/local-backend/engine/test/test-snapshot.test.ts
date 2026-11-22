import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildTestSnapshot, parseTestSnapshot, TEST_SNAPSHOT_LIMITS } from '../src/test-snapshot.ts';
import { rawCall, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

async function makeKey(site: Site, scope: string): Promise<string> {
  const made = await site.owner.hub('POST', '/backends/demo/api-keys', { name: scope, scope });
  expect(made.status, made.body).toBe(201);
  return (made.json() as { key: string }).key;
}

const withKey = (site: Site, key: string, method: string, path: string, headers: Record<string, string> = {}) =>
  rawCall(site.team.port, { method, path, headers: { authorization: `Bearer ${key}`, ...headers } });

/** The `demo` backend with an app user (a password hash), a sign-in session, a certificate, a handler, content and two media files (one big). */
function plantSecrets(site: Site): { passwordHash: string; jwtSecret: string; big: string; small: string } {
  const running = site.team.registry.running('demo');
  if (running === undefined) throw new Error('demo is not running');
  const { engine } = running;
  const db = engine.store.db;
  db.prepare("INSERT INTO _users (username, email, passwordHash, createdAt, updatedAt) VALUES ('alice', 'alice@example.com', 'scrypt$16384$8$1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo', 'x', 'x')").run();
  db.prepare("INSERT INTO _refresh_tokens (userId, tokenHash, family, expiresAt, createdAt) VALUES (1, 'refresh-hash-marker', 'fam', 'x', 'x')").run();
  const dir = engine.folder.dir;
  mkdirSync(join(dir, '.data', 'certs'), { recursive: true });
  writeFileSync(join(dir, '.data', 'certs', 'key.pem'), '-----BEGIN PRIVATE KEY-----\nCERT-KEY-MARKER\n');
  mkdirSync(join(dir, 'handlers'), { recursive: true });
  writeFileSync(join(dir, 'handlers', 'hello.mjs'), 'export default () => ({ status: 200, body: { hi: 1 } });\n');
  const small = 'a'.repeat(32);
  const big = 'b'.repeat(32);
  for (const [id, size] of [[small, 20], [big, TEST_SNAPSHOT_LIMITS.mediaBytes + 10]] as const) {
    mkdirSync(join(dir, '.data', 'media', id.slice(0, 2)), { recursive: true });
    writeFileSync(join(dir, '.data', 'media', id.slice(0, 2), id), Buffer.alloc(size, 7));
    db.prepare("INSERT INTO _media (id, originalName, mime, size, sha256, createdAt, uploadedBy) VALUES (?, 'f.bin', 'application/octet-stream', ?, 'orig', '2025-01-01T00:00:00.000Z', 1)").run(id, size);
  }
  const secrets = JSON.parse(readFileSync(join(dir, '.data', 'secrets.json'), 'utf8')) as Record<string, string>;
  return { passwordHash: 'aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNo', jwtSecret: Object.values(secrets)[0] ?? 'no-secret', big, small };
}

describe('the test snapshot route', () => {
  it('serves the definition, seed, handlers, data and small media, and no secret of any kind', async () => {
    const site = await startSite();
    const planted = plantSecrets(site);
    const key = await makeKey(site, 'read-definition');
    const answer = await withKey(site, key, 'GET', '/b/demo/__definition');
    expect(answer.status).toBe(200);
    expect(String(answer.headers['content-type'])).toContain('application/json');
    const snapshot = parseTestSnapshot(answer.body);
    expect(snapshot.files.map((file) => file.path)).toEqual(expect.arrayContaining(['backend.json', 'handlers/hello.mjs', `media/${planted.small}`, `media/${planted.big}`]));
    expect(snapshot.tables.products).toHaveLength(2);
    // The big file is a placeholder with a record that matches the placeholder bytes.
    expect(snapshot.placeholders).toEqual([planted.big]);
    const bigFile = snapshot.files.find((file) => file.path === `media/${planted.big}`);
    expect(bigFile?.size).toBeLessThan(200);
    expect(snapshot.tables._media?.find((row) => row.id === planted.big)?.size).toBe(bigFile?.size);
    // Nothing that is a secret, an account, a session, a key, a log or a certificate.
    for (const secret of [planted.passwordHash, planted.jwtSecret, 'alice', 'refresh-hash-marker', 'CERT-KEY-MARKER', 'BEGIN PRIVATE', key, key.slice(0, 12), 'owner@example.com', 'argon', 'scrypt$']) {
      expect(answer.body, secret).not.toContain(secret);
    }
    expect(Object.keys(snapshot.tables).sort()).not.toEqual(expect.arrayContaining(['_users']));
    expect(Object.keys(snapshot.tables)).not.toContain('_refresh_tokens');
    expect(snapshot.files.some((file) => /secrets|certs|logs|\.pem/.test(file.path))).toBe(false);
    expect(snapshot.excluded.join(' ')).toContain('secrets.json');
  });

  it('has a strong ETag and answers 304 to If-None-Match, and a new ETag once the data changes', async () => {
    const site = await startSite();
    const key = await makeKey(site, 'read-definition');
    const first = await withKey(site, key, 'GET', '/b/demo/__definition');
    const etag = String(first.headers.etag);
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const again = await withKey(site, key, 'GET', '/b/demo/__definition', { 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(again.body).toBe('');
    expect(again.headers.etag).toBe(etag);
    expect((await withKey(site, key, 'GET', '/b/demo/__definition', { 'if-none-match': '"other"' })).status).toBe(200);
    expect((await withKey(site, key, 'GET', '/b/demo/__definition')).headers.etag).toBe(etag);
    const created = await site.owner.admin('demo', 'POST', '/data/products', { title: 'New', price: 1 });
    expect(created.status).toBe(201);
    const changed = await withKey(site, key, 'GET', '/b/demo/__definition', { 'if-none-match': etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
  });

  it('enforces the key scope, the backend and the method', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const read = await makeKey(site, 'read-definition');
    const admin = await makeKey(site, 'admin');
    const sessions = await makeKey(site, 'sessions');
    const pub = await makeKey(site, 'public');
    expect((await withKey(site, read, 'GET', '/b/demo/__definition')).status).toBe(200);
    expect((await withKey(site, admin, 'GET', '/b/demo/__definition')).status).toBe(200);
    expect((await withKey(site, sessions, 'GET', '/b/demo/__definition')).status).toBe(403);
    expect((await withKey(site, pub, 'GET', '/b/demo/__definition')).status).toBe(403);
    expect((await withKey(site, read, 'GET', '/b/other/__definition')).status).toBe(403);
    expect((await withKey(site, 'tlb_notarealkeynotarealkeynotarealkeynotareal1', 'GET', '/b/demo/__definition')).status).toBe(401);
    expect((await rawCall(site.team.port, { path: '/b/demo/__definition' })).status).toBe(401);
    expect((await withKey(site, read, 'POST', '/b/demo/__definition')).status).toBe(405);
    // Another backend's name is not a way around it.
    expect((await withKey(site, read, 'GET', '/b/nope/__definition')).status).toBe(404);
    // An account cookie is not accepted on the public route: only keys are.
    expect((await site.owner.call('GET', '/b/demo/__definition')).status).toBe(401);
  });

  it('refuses a backend over the size cap and rate-limits a key', async () => {
    const site = await startSite({ controlRatePerMinute: 3 });
    const key = await makeKey(site, 'read-definition');
    const running = site.team.registry.running('demo');
    if (running === undefined) throw new Error('demo is not running');
    const engine = running.engine;
    expect(() => buildTestSnapshot({ dir: engine.folder.dir, db: engine.store.db, collections: ['products'], maxBytes: 200 })).toThrow(/larger than a test snapshot/);
    for (let n = 0; n < 3; n += 1) expect((await withKey(site, key, 'GET', '/b/demo/__definition')).status).toBe(200);
    const limited = await withKey(site, key, 'GET', '/b/demo/__definition');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('is also an admin route for the local web and desktop (admin role, read-definition keys included)', async () => {
    const site = await startSite();
    const viaAdmin = await site.owner.admin('demo', 'GET', '/test-snapshot');
    expect(viaAdmin.status).toBe(200);
    expect(parseTestSnapshot(viaAdmin.body).backend).toBe('Demo');
    const etag = String(viaAdmin.headers.etag);
    expect((await site.owner.admin('demo', 'GET', '/test-snapshot', undefined)).status).toBe(200);
    const second = await site.owner.call('GET', '/__admin/b/demo/test-snapshot', undefined, { 'if-none-match': etag });
    expect(second.status).toBe(304);
  });
});
