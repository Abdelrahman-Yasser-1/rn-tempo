import { afterEach, describe, expect, it } from 'vitest';

import { parseTestSnapshot } from '../src/test-snapshot.ts';
import { member, rawCall, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

const TOKEN = 'receiver-token-123456';
const URL_SECRET = 'query-token-987';
const HOOK = { id: 'orders', url: `https://hooks.example.com/in?token=${URL_SECRET}`, events: ['*'], headers: { authorization: `Bearer ${TOKEN}` } };

async function siteWithHook(): Promise<Site> {
  const site = await startSite();
  const made = await site.owner.admin('demo', 'POST', '/webhooks', HOOK);
  expect(made.status, made.body).toBe(201);
  return site;
}

async function keyOf(site: Site, scope: string): Promise<string> {
  const made = await site.owner.hub('POST', '/backends/demo/api-keys', { name: scope, scope });
  return (made.json() as { key: string }).key;
}

const withKey = (site: Site, key: string, path: string) => rawCall(site.team.port, { path, headers: { authorization: `Bearer ${key}` } });

function expectHidden(text: string): void {
  for (const secret of [TOKEN, URL_SECRET]) expect(text, secret).not.toContain(secret);
  expect(text).toContain('[REDACTED]');
  expect(text).toContain('token=***');
}

describe('webhook header values and address query values in the definition and the test snapshot', () => {
  it('hides them from a viewer and from a read-definition key, on every route that returns the definition', async () => {
    const site = await siteWithHook();
    const viewer = await member(site, 'viewer@example.com', 'viewer');
    expectHidden((await viewer.admin('demo', 'GET', '/definition')).body);
    const key = await keyOf(site, 'read-definition');
    expectHidden((await withKey(site, key, '/__admin/b/demo/definition')).body);
    const snapshot = await withKey(site, key, '/__admin/b/demo/test-snapshot');
    expect(snapshot.status).toBe(200);
    for (const secret of [TOKEN, URL_SECRET]) expect(snapshot.body, secret).not.toContain(secret);
    const download = await withKey(site, key, '/b/demo/__definition');
    expect(download.status).toBe(200);
    const backendJson = parseTestSnapshot(download.body).files.find((file) => file.path === 'backend.json');
    expect(backendJson).toBeDefined();
    for (const secret of [TOKEN, URL_SECRET]) expect(download.body, secret).not.toContain(secret);
  });

  it('an editor and an admin key still read the definition as written, so a read-modify-write keeps the values', async () => {
    const site = await siteWithHook();
    const editor = await member(site, 'editor@example.com', 'editor');
    const mine = (await editor.admin('demo', 'GET', '/definition')).body;
    expect(mine).toContain(TOKEN);
    expect(mine).toContain(URL_SECRET);
    const admin = await keyOf(site, 'admin');
    expect((await withKey(site, admin, '/__admin/b/demo/definition')).body).toContain(TOKEN);
  });
});
