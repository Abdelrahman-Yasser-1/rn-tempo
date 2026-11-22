import { afterEach, describe, expect, it } from 'vitest';

import { REDACTED, redactDeep, redactUrl, scrubKeys } from '@rn-tempo/dev-api';

import { member, rawCall, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

async function makeKey(site: Site, scope: string, name = 'CI'): Promise<{ key: string; id: number }> {
  const made = await site.owner.hub('POST', '/backends/demo/api-keys', { name, scope });
  expect(made.status, made.body).toBe(201);
  const body = made.json() as { key: string; record: { id: number } };
  return { key: body.key, id: body.record.id };
}

const withKey = (site: Site, key: string, method: string, path: string, body?: unknown) =>
  rawCall(site.team.port, { method, path, headers: { authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

describe('AC-LP-2 API keys', () => {
  it('AC-LP-2 shows a key once, stores only its hash and a display prefix, and lists it without the key', async () => {
    const site = await startSite();
    const { key } = await makeKey(site, 'read-definition');
    expect(key).toMatch(/^tlb_[A-Za-z0-9_-]{43}$/);
    const listed = await site.owner.hub('GET', '/backends/demo/api-keys');
    expect(listed.body).not.toContain(key);
    const [row] = listed.json() as unknown as { prefix: string; scope: string; lastUsedAt: string | null }[];
    expect(row?.prefix).toBe(key.slice(0, 12));
    expect(row?.lastUsedAt).toBeNull();
    const stored = site.team.store.db.prepare('SELECT hash, prefix FROM api_keys').all();
    expect(JSON.stringify(stored)).not.toContain(key);
    expect(String(stored[0]?.hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('AC-LP-2 lets a read-definition key read the definition and the snapshot and nothing else', async () => {
    const site = await startSite();
    const { key } = await makeKey(site, 'read-definition');
    const def = await withKey(site, key, 'GET', '/__admin/b/demo/definition');
    expect(def.status).toBe(200);
    expect(def.json().name).toBe('Demo');
    const snapshot = await withKey(site, key, 'GET', '/__admin/b/demo/test-snapshot');
    expect(snapshot.status).toBe(200);
    expect(String(snapshot.headers['content-type'])).toContain('json');
    // The backup holds the database (app users' hashes): not for a read-only key.
    expect((await withKey(site, key, 'GET', '/__admin/b/demo/snapshot')).status).toBe(403);
    expect((await withKey(site, key, 'PUT', '/__admin/b/demo/definition', def.json())).status).toBe(403);
    expect((await withKey(site, key, 'POST', '/__admin/b/demo/data/products', { title: 'x' })).status).toBe(403);
    expect((await withKey(site, key, 'GET', '/__admin/b/demo/users')).status).toBe(403);
    expect((await withKey(site, key, 'GET', '/__admin/b/demo/data/products')).status).toBe(403);
    // It is not an account: no server routes.
    expect((await withKey(site, key, 'GET', '/__hub/backends')).status).toBe(403);
    const [row] = (await site.owner.hub('GET', '/backends/demo/api-keys')).json() as unknown as { lastUsedAt: string | null }[];
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it('AC-LP-2 limits a key to its backend and its scope', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const admin = await makeKey(site, 'admin');
    expect((await withKey(site, admin.key, 'POST', '/__admin/b/demo/data/products', { title: 'Via key', price: 1 })).status).toBe(201);
    expect((await withKey(site, admin.key, 'GET', '/__admin/b/other/definition')).status).toBe(403);
    expect((await withKey(site, admin.key, 'GET', '/__admin/b/demo/snapshot')).status).toBe(200);
    for (const scope of ['sessions', 'public']) {
      const other = await makeKey(site, scope, scope);
      expect((await withKey(site, other.key, 'GET', '/__admin/b/demo/definition')).status, scope).toBe(403);
    }
    expect((await withKey(site, 'tlb_notarealkeynotarealkeynotarealkeynotareal1', 'GET', '/__admin/b/demo/definition')).status).toBe(401);
    expect((await withKey(site, 'not-a-key', 'GET', '/__admin/b/demo/definition')).status).toBe(401);
  });

  it('AC-LP-2 revokes a key at once and only for the backend it belongs to', async () => {
    const site = await startSite();
    const { key, id } = await makeKey(site, 'admin');
    expect((await withKey(site, key, 'GET', '/__admin/b/demo/info')).status).toBe(200);
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    expect((await site.owner.hub('DELETE', `/backends/other/api-keys/${String(id)}`)).status).toBe(404);
    expect((await site.owner.hub('DELETE', `/backends/demo/api-keys/${String(id)}`)).status).toBe(200);
    expect((await withKey(site, key, 'GET', '/__admin/b/demo/info')).status).toBe(401);
  });

  it('AC-LP-2 lets only an admin of the backend make keys', async () => {
    const site = await startSite();
    const editor = await member(site, 'e@example.com', 'editor');
    expect((await editor.hub('POST', '/backends/demo/api-keys', { name: 'x', scope: 'admin' })).status).toBe(403);
    const admin = await member(site, 'a@example.com', 'admin');
    expect((await admin.hub('POST', '/backends/demo/api-keys', { name: 'x', scope: 'nonsense' })).status).toBe(400);
    expect((await admin.hub('POST', '/backends/demo/api-keys', { name: '', scope: 'admin' })).status).toBe(400);
    expect((await admin.hub('POST', '/backends/demo/api-keys', { name: 'ci', scope: 'read-definition' })).status).toBe(201);
  });

  it('AC-LP-2 keeps keys out of logs: the redaction covers headers, query values, bodies and text', async () => {
    const key = `tlb_${'A'.repeat(43)}`;
    expect(redactDeep({ 'x-tempo-access-key': key, accessKey: key, note: `see ${key} here`, nested: [{ totpSecret: 'ABC' }] })).toEqual({ 'x-tempo-access-key': REDACTED, accessKey: REDACTED, note: `see ${REDACTED} here`, nested: [{ totpSecret: REDACTED }] });
    expect(redactUrl(`/products?x=${key}`)).not.toContain(key);
    expect(redactUrl(`/b/${key}/products`)).not.toContain(key);
    expect(scrubKeys(`a ${key} b`)).toBe(`a ${REDACTED} b`);
  });

  it('AC-LP-2 never writes a key to the request log, the audit or the engine log', async () => {
    const site = await startSite();
    const publicKey = await makeKey(site, 'public', 'app');
    const admin = await makeKey(site, 'admin', 'ci');
    await site.owner.admin('demo', 'PUT', '/definition', { ...(await site.owner.admin('demo', 'GET', '/definition')).json(), publicAccess: 'key' });
    await rawCall(site.team.port, { path: `/b/demo/products?access_key=${publicKey.key}`, headers: { 'x-tempo-access-key': publicKey.key } });
    await withKey(site, admin.key, 'POST', '/__admin/b/demo/data/products', { title: `note ${admin.key}`, price: 1 });
    const running = site.team.registry.running('demo');
    const everything = JSON.stringify([running?.engine.requests.snapshot(0), site.team.audit.query({}).entries]);
    expect(everything).not.toContain(publicKey.key);
    expect(everything).not.toContain(admin.key);
    expect(everything).toContain(admin.key.slice(0, 12));
  });
});
