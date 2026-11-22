import { afterEach, describe, expect, it } from 'vitest';

import { member, rawCall, startSite, stopTeams, type Browser, type Site } from './team-helpers.ts';

afterEach(stopTeams);

async function makeKey(by: Browser, scope: string): Promise<string> {
  const made = await by.hub('POST', '/backends/demo/api-keys', { name: 'CI', scope });
  expect(made.status, made.body).toBe(201);
  return (made.json() as { key: string }).key;
}

const definitionWith = (site: Site, key: string) => rawCall(site.team.port, { path: '/__admin/b/demo/definition', headers: { authorization: `Bearer ${key}` } });
const idOf = (site: Site, email: string): number => site.team.store.accountByEmail(email)?.id ?? 0;

describe('AC-LP-2 API keys are tied to the access of the person who made them', () => {
  it('AC-LP-2 keeps an owner-made key valid while the owner is active', async () => {
    const site = await startSite();
    const key = await makeKey(site.owner, 'read-definition');
    expect((await definitionWith(site, key)).status).toBe(200);
  });

  it('AC-LP-2 stops a key when its creator is demoted below what the scope needs', async () => {
    const site = await startSite();
    const admin = await member(site, 'admin@example.com', 'admin');
    const adminKey = await makeKey(admin, 'admin');
    const readKey = await makeKey(admin, 'read-definition');
    expect((await definitionWith(site, adminKey)).status).toBe(200);
    await site.owner.hub('PUT', `/backends/demo/members/${String(idOf(site, 'admin@example.com'))}`, { role: 'editor' });
    expect((await definitionWith(site, adminKey)).status).toBe(401);
    expect((await definitionWith(site, readKey)).status).toBe(200);
    await site.owner.hub('PUT', `/backends/demo/members/${String(idOf(site, 'admin@example.com'))}`, { role: 'viewer' });
    expect((await definitionWith(site, readKey)).status).toBe(401);
  });

  it('AC-LP-2 revokes the keys of a creator whose membership is removed, only on that backend', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const admin = await member(site, 'admin@example.com', 'admin');
    await site.owner.hub('POST', '/backends/other/members', { email: 'admin@example.com', role: 'admin' });
    const key = await makeKey(admin, 'read-definition');
    const otherKey = ((await admin.hub('POST', '/backends/other/api-keys', { name: 'o', scope: 'read-definition' })).json() as { key: string }).key;
    const removed = await site.owner.hub('DELETE', `/backends/demo/members/${String(idOf(site, 'admin@example.com'))}`);
    expect(removed.status, removed.body).toBe(200);
    expect((await definitionWith(site, key)).status).toBe(401);
    const keys = (await site.owner.hub('GET', '/backends/demo/api-keys')).json() as unknown as { revokedAt: string | null }[];
    expect(keys[0]?.revokedAt).not.toBeNull();
    expect((await rawCall(site.team.port, { path: '/__admin/b/other/definition', headers: { authorization: `Bearer ${otherKey}` } })).status).toBe(200);
  });

  it('AC-LP-2 revokes every key of an account that is disabled or deleted', async () => {
    const site = await startSite();
    const disabled = await member(site, 'a@example.com', 'admin');
    const deleted = await member(site, 'b@example.com', 'admin');
    const disabledKey = await makeKey(disabled, 'admin');
    const deletedKey = await makeKey(deleted, 'admin');
    await site.owner.hub('POST', `/team/accounts/${String(idOf(site, 'a@example.com'))}/disable`);
    await site.owner.hub('DELETE', `/team/accounts/${String(idOf(site, 'b@example.com'))}`);
    expect((await definitionWith(site, disabledKey)).status).toBe(401);
    expect((await definitionWith(site, deletedKey)).status).toBe(401);
    // Enabling the account again does not bring a revoked key back.
    await site.owner.hub('POST', `/team/accounts/${String(idOf(site, 'a@example.com'))}/enable`);
    expect((await definitionWith(site, disabledKey)).status).toBe(401);
  });

  it('AC-LP-2 adds the creator column to a database made before it existed, leaving old keys untied', async () => {
    const site = await startSite();
    const { db } = site.team.store;
    db.exec('ALTER TABLE api_keys DROP COLUMN createdByAccountId');
    const { TeamStore } = await import('../src/team-store.ts');
    const dir = site.team.store.db.prepare('PRAGMA database_list').get() as { file: string };
    expect(dir.file).toContain('server.sqlite');
    const reopened = new TeamStore(dir.file.replace(/server\.sqlite$/, ''));
    expect(reopened.db.prepare('PRAGMA table_info(api_keys)').all().some((column) => column.name === 'createdByAccountId')).toBe(true);
    reopened.close();
  });
});
