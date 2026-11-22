import { afterEach, describe, expect, it } from 'vitest';

import { member, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

const idOf = (site: Site, email: string): number => site.team.store.accountByEmail(email)?.id ?? 0;
const roleOf = (site: Site, email: string, backend = 'demo'): string | undefined => site.team.store.membership(idOf(site, email), backend)?.role;

describe('AC-LP-2 inviting an existing account', () => {
  it('AC-LP-2 refuses to change the role of someone who is already a member (the role route has the checks)', async () => {
    const site = await startSite();
    const admin = await member(site, 'admin@example.com', 'admin');
    await member(site, 'boss@example.com', 'admin');
    await member(site, 'ed@example.com', 'editor');
    for (const email of ['boss@example.com', 'admin@example.com', 'ed@example.com']) {
      const answer = await admin.hub('POST', '/backends/demo/members', { email, role: 'viewer' });
      expect(answer.status, email).toBe(409);
      expect(answer.body).toContain('already a member');
    }
    expect(roleOf(site, 'boss@example.com')).toBe('admin');
    expect(roleOf(site, 'admin@example.com')).toBe('admin');
    expect(roleOf(site, 'ed@example.com')).toBe('editor');
  });

  it('AC-LP-2 does not let an admin add an account that is an admin elsewhere, but the owner may', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const admin = await member(site, 'admin@example.com', 'admin');
    await member(site, 'boss@example.com', 'admin', 'other');
    const refused = await admin.hub('POST', '/backends/demo/members', { email: 'boss@example.com', role: 'viewer' });
    expect(refused.status).toBe(403);
    expect(roleOf(site, 'boss@example.com')).toBeUndefined();
    expect((await site.owner.hub('POST', '/backends/demo/members', { email: 'boss@example.com', role: 'viewer' })).status).toBe(200);
    expect(roleOf(site, 'boss@example.com')).toBe('viewer');
  });

  it('AC-LP-2 lets an admin add an ordinary existing account to this backend, and keeps the role route within the caller\'s role', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const admin = await member(site, 'admin@example.com', 'admin');
    await member(site, 'ed@example.com', 'editor', 'other');
    const added = await admin.hub('POST', '/backends/demo/members', { email: 'ed@example.com', role: 'viewer' });
    expect(added.status, added.body).toBe(200);
    expect(roleOf(site, 'ed@example.com')).toBe('viewer');
    // Role changes still go through `manageable`: an admin cannot touch themselves or another admin.
    expect((await admin.hub('PUT', `/backends/demo/members/${String(idOf(site, 'admin@example.com'))}`, { role: 'viewer' })).status).toBe(403);
    expect((await admin.hub('PUT', `/backends/demo/members/${String(idOf(site, 'ed@example.com'))}`, { role: 'editor' })).status).toBe(200);
  });
});
