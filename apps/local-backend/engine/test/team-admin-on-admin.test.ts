import { afterEach, describe, expect, it } from 'vitest';

import { member, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

const idOf = (site: Site, email: string): number => site.team.store.accountByEmail(email)?.id ?? 0;

describe('AC-LP-2 an admin cannot act on another admin', () => {
  async function twoAdmins() {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const first = await member(site, 'a1@example.com', 'admin');
    await site.owner.hub('POST', '/backends/other/members', { email: 'a1@example.com', role: 'admin' });
    await member(site, 'a2@example.com', 'admin');
    await site.owner.hub('POST', '/backends/other/members', { email: 'a2@example.com', role: 'admin' });
    return { site, first, second: idOf(site, 'a2@example.com') };
  }

  it('AC-LP-2 refuses reset, role change and removal of an admin of the same backends', async () => {
    const { site, first, second } = await twoAdmins();
    for (const backend of ['demo', 'other']) {
      expect((await first.hub('POST', `/backends/${backend}/members/${String(second)}/reset-totp`)).status, 'reset-totp').toBe(403);
      expect((await first.hub('POST', `/backends/${backend}/members/${String(second)}/reset-link`)).status, 'reset-link').toBe(403);
      expect((await first.hub('PUT', `/backends/${backend}/members/${String(second)}`, { role: 'viewer' })).status, 'demote').toBe(403);
      expect((await first.hub('DELETE', `/backends/${backend}/members/${String(second)}`)).status, 'remove').toBe(403);
    }
    expect(site.team.store.membership(second, 'demo')?.role).toBe('admin');
    expect(site.team.store.membership(second, 'other')?.role).toBe('admin');
  });

  it('AC-LP-2 refuses to touch an account that is admin on another backend, even through a backend where it is only a viewer', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const admin = await member(site, 'adm@example.com', 'admin');
    await member(site, 'x@example.com', 'viewer');
    await site.owner.hub('POST', '/backends/other/members', { email: 'x@example.com', role: 'admin' });
    const x = idOf(site, 'x@example.com');
    expect((await admin.hub('PUT', `/backends/demo/members/${String(x)}`, { role: 'editor' })).status).toBe(403);
    expect((await admin.hub('DELETE', `/backends/demo/members/${String(x)}`)).status).toBe(403);
  });

  it('AC-LP-2 lets the owner do all of it', async () => {
    const { site, second } = await twoAdmins();
    expect((await site.owner.hub('POST', `/backends/demo/members/${String(second)}/reset-totp`)).status).toBe(200);
    expect((await site.owner.hub('POST', `/backends/demo/members/${String(second)}/reset-link`)).status).toBe(200);
    expect((await site.owner.hub('PUT', `/backends/demo/members/${String(second)}`, { role: 'viewer' })).status).toBe(200);
    expect((await site.owner.hub('DELETE', `/backends/other/members/${String(second)}`)).status).toBe(200);
    expect((await site.owner.hub('POST', `/team/accounts/${String(second)}/reset-totp`)).status).toBe(200);
  });
});
