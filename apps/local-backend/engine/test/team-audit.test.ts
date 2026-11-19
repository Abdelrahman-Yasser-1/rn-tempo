import { afterEach, describe, expect, it } from 'vitest';

import { member, PASSWORD, startSite, stopTeams } from './team-helpers.ts';

afterEach(stopTeams);

interface Entry {
  at: string;
  actor: { kind: string; label: string };
  backend: string | null;
  action: string;
  target: string;
  status: number;
  denied: boolean;
  summary: { before?: unknown; after?: unknown } | null;
}
const entries = (body: Record<string, unknown>): Entry[] => body.entries as Entry[];

describe('AC-LP-2 audit log', () => {
  it('AC-LP-2 records an editor write with who, when, backend, action, target and a before/after', async () => {
    const site = await startSite();
    const editor = await member(site, 'ed@example.com', 'editor');
    const before = (await editor.admin('demo', 'GET', '/data/products/1')).json();
    const wrote = await editor.admin('demo', 'PATCH', '/data/products/1', { title: 'Renamed by the editor' });
    expect(wrote.status, wrote.body).toBe(200);
    const log = await site.owner.hub('GET', '/backends/demo/audit?action=PATCH');
    const [entry] = entries(log.json());
    expect(entry?.actor).toMatchObject({ kind: 'account', label: 'ed@example.com' });
    expect(entry?.backend).toBe('demo');
    expect(entry?.action).toBe('PATCH /data/:collection/:id');
    expect(entry?.target).toBe('products/1');
    expect(entry?.status).toBe(200);
    expect(Date.parse(entry?.at ?? '')).toBeGreaterThan(0);
    expect(entry?.summary?.after).toEqual({ title: 'Renamed by the editor' });
    expect((entry?.summary?.before as { title?: string }).title).toBe((before as { title?: string }).title);
    // Reads are not audited.
    expect(entries((await site.owner.hub('GET', '/backends/demo/audit?action=GET')).json())).toHaveLength(0);
  });

  it('AC-LP-2 never puts a password, token, key, TOTP secret or upload bytes in an entry', async () => {
    const site = await startSite();
    const editor = await member(site, 'ed@example.com', 'editor');
    const made = await editor.admin('demo', 'POST', '/users', { username: 'zed', password: 'hunter2 hunter2 hunter2', email: 'zed@example.com' });
    expect(made.status, made.body).toBe(201);
    const id = String((made.json() as { id: number }).id);
    await editor.admin('demo', 'POST', `/users/${id}/password`, { password: 'brand new secret pw' });
    const minted = await editor.admin('demo', 'POST', `/users/${id}/token`);
    const form = new FormData();
    form.append('file', new Blob(['SECRET-MEDIA-BYTES-0123456789'], { type: 'text/plain' }), 'note.txt');
    const upload = await fetch(`http://127.0.0.1:${String(site.team.port)}/__admin/b/demo/media`, { method: 'POST', headers: { cookie: editor.cookie, origin: editor.origin, 'x-csrf-token': editor.csrf }, body: form });
    expect(upload.status).toBe(201);
    await editor.hub('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'a different long one' });
    const totp = (await editor.hub('POST', '/me/totp/setup')).json() as { secret: string };
    await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'k', scope: 'admin' });
    const all = JSON.stringify(site.team.audit.query({ limit: 500 }).entries);
    for (const secret of ['hunter2', 'brand new secret', 'SECRET-MEDIA-BYTES', 'a different long one', PASSWORD, totp.secret, String((minted.json() as { token?: string }).token ?? 'no-token')]) expect(all, secret).not.toContain(secret);
    expect(all).toContain('REDACTED');
    expect(all).toContain('not stored');
    expect(all).not.toMatch(/tlb_[A-Za-z0-9_-]{20,}/);
    const upl = site.team.audit.query({ action: 'POST /media' }).entries[0];
    expect(upl?.summary?.after).toMatchObject({ upload: expect.stringContaining('bytes') });
  });

  it('AC-LP-2 records a refused write and writes made with an API key (by prefix)', async () => {
    const site = await startSite();
    const viewer = await member(site, 'v@example.com', 'viewer');
    expect((await viewer.admin('demo', 'DELETE', '/data/products/1')).status).toBe(403);
    const key = ((await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'ci', scope: 'admin' })).json() as { key: string }).key;
    await fetch(`http://127.0.0.1:${String(site.team.port)}/__admin/b/demo/scenarios`, { method: 'DELETE', headers: { authorization: `Bearer ${key}` } });
    const log = entries(site.team.audit.query({ backend: 'demo' }) as unknown as Record<string, unknown>);
    const denied = log.find((entry) => entry.denied);
    expect(denied).toMatchObject({ status: 403, action: 'DELETE /data/:collection/:id', actor: { label: 'v@example.com' } });
    const viaKey = log.find((entry) => entry.actor.kind === 'key');
    expect(viaKey?.actor.label).toBe(key.slice(0, 12));
    expect(viaKey?.action).toBe('DELETE /scenarios');
  });

  it('AC-LP-2 records account and key changes on the server routes too', async () => {
    const site = await startSite();
    await member(site, 'v@example.com', 'viewer');
    await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'ci', scope: 'public' });
    const actions = entries(site.team.audit.query({}) as unknown as Record<string, unknown>).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['POST /backends', 'POST /backends/:id/members', 'POST /backends/:id/api-keys', 'account.setup', 'login']));
    const invite = site.team.audit.query({ action: 'POST /backends/:id/members' }).entries[0];
    expect(invite?.target).toBe('v@example.com as viewer');
  });

  it('AC-LP-2 filters by actor, action, backend and time, and shows it to admins and owners only', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const admin = await member(site, 'adm@example.com', 'admin');
    const editor = await member(site, 'ed@example.com', 'editor');
    await editor.admin('demo', 'POST', '/data/products', { title: 'One', price: 1 });
    await site.owner.admin('other', 'POST', '/collections', { name: 'things', fields: [] });
    site.clock.now += 60_000;
    const since = new Date(site.clock.now).toISOString();
    await editor.admin('demo', 'POST', '/data/products', { title: 'Two', price: 2 });
    expect(entries((await admin.hub('GET', '/backends/demo/audit?actor=ed@')).json()).length).toBeGreaterThan(0);
    expect(entries((await admin.hub('GET', '/backends/demo/audit?actor=nobody')).json())).toHaveLength(0);
    expect(entries((await admin.hub('GET', `/backends/demo/audit?action=data&since=${encodeURIComponent(since)}`)).json())).toHaveLength(1);
    // An admin of demo sees demo only; the owner sees everything.
    expect((await admin.hub('GET', '/backends/other/audit')).status).toBe(404);
    expect(entries((await admin.hub('GET', '/backends/demo/audit?limit=500')).json()).every((entry) => entry.backend === 'demo')).toBe(true);
    expect((await editor.hub('GET', '/backends/demo/audit')).status).toBe(403);
    expect((await admin.hub('GET', '/audit')).status).toBe(403);
    expect(entries((await site.owner.hub('GET', '/audit?backend=other')).json()).every((entry) => entry.backend === 'other')).toBe(true);
    expect(((await site.owner.hub('GET', '/audit?limit=2')).json() as { total: number }).total).toBeGreaterThan(5);
  });

  it('AC-LP-2 keeps entries for 90 days by default and for the configured number of days otherwise', async () => {
    const site = await startSite();
    expect(site.team.audit.retentionDays).toBe(90);
    const total = (): number => site.team.audit.query({}).total;
    const start = total();
    expect(start).toBeGreaterThan(0);
    site.clock.now += 89 * 24 * 60 * 60_000;
    expect(site.team.audit.prune()).toBe(0);
    site.clock.now += 2 * 24 * 60 * 60_000;
    expect(site.team.audit.prune()).toBe(start);
    expect(total()).toBe(0);
    const short = await startSite({ auditDays: 7 });
    expect(short.team.audit.retentionDays).toBe(7);
    short.clock.now += 8 * 24 * 60 * 60_000;
    expect(short.team.audit.prune()).toBeGreaterThan(0);
  });
});
