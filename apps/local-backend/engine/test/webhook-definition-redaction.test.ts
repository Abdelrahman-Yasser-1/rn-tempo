import { afterEach, describe, expect, it } from 'vitest';

import { parseTestSnapshot } from '../src/test-snapshot.ts';
import { maskUrl } from '../src/webhooks.ts';
import { auditSummary } from '../src/audit.ts';
import { webhookAuditBody } from '../src/admin-webhooks.ts';
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
  expect(text).toContain('https://hooks.example.com/…');
  expect(text).not.toContain('/in?');
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

describe('addresses whose path holds the secret', () => {
  const SLACK = 'https://hooks.slack.com/services/T0123ABCD/B0456EFGH/slack-path-secret';
  const DISCORD = 'https://discord.com/api/webhooks/4242424242/discord-path-secret-token';

  it('masks an address to scheme://host/… (no path, no query)', () => {
    expect(maskUrl(SLACK)).toBe('https://hooks.slack.com/…');
    expect(maskUrl(DISCORD)).toBe('https://discord.com/…');
    expect(maskUrl(`${DISCORD}?wait=true&thread_id=9`)).toBe('https://discord.com/…');
    expect(maskUrl('not a url')).toBe('[invalid address]');
  });

  it('hides a Slack-style and a Discord-style path from viewers, read-definition keys, the delivery views and the audit copy', async () => {
    const site = await startSite();
    for (const [id, url] of [['slack', SLACK], ['discord', DISCORD]] as const) expect((await site.owner.admin('demo', 'POST', '/webhooks', { id, url, events: ['*'] })).status).toBe(201);
    const viewer = await member(site, 'viewer@example.com', 'viewer');
    const key = await keyOf(site, 'read-definition');
    const reads = [
      (await viewer.admin('demo', 'GET', '/webhooks')).body,
      (await viewer.admin('demo', 'GET', '/webhooks/slack')).body,
      (await viewer.admin('demo', 'GET', '/webhooks/discord')).body,
      (await viewer.admin('demo', 'GET', '/definition')).body,
      (await withKey(site, key, '/__admin/b/demo/definition')).body,
      (await withKey(site, key, '/__admin/b/demo/test-snapshot')).body,
      (await withKey(site, key, '/b/demo/__definition')).body,
      JSON.stringify(auditSummary(webhookAuditBody({ id: 'slack', url: SLACK, events: ['*'] }))),
    ];
    for (const text of reads) for (const secret of ['slack-path-secret', 'T0123ABCD', 'discord-path-secret-token', '4242424242']) expect(text, secret).not.toContain(secret);
    expect(reads[0]).toContain('https://hooks.slack.com/…');
    expect(reads[0]).toContain('https://discord.com/…');
    // The editor's full view keeps the address as written.
    const editor = await member(site, 'editor@example.com', 'editor');
    expect((await editor.admin('demo', 'GET', '/webhooks/slack/full')).body).toContain('slack-path-secret');
  });
});
