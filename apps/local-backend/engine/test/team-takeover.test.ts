import { afterEach, describe, expect, it } from 'vitest';

import { member, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

const idOf = (site: Site, email: string): number => site.team.store.accountByEmail(email)?.id ?? 0;

describe('AC-LP-2 member routes cannot take over an account', () => {
  it('AC-LP-2 refuses a backend admin a setup link or TOTP reset for the owner, another admin or an account with access elsewhere', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    const admin = await member(site, 'admin@example.com', 'admin');
    await member(site, 'ed@example.com', 'editor');
    // The editor also has access to another backend the admin does not administer; so does an admin there.
    await site.owner.hub('POST', '/backends/other/members', { email: 'ed@example.com', role: 'viewer' });
    await member(site, 'boss@example.com', 'admin');
    const attempts = ['ed@example.com', 'boss@example.com', 'owner@example.com'];
    for (const email of attempts) {
      for (const action of ['reset-link', 'reset-totp']) {
        const answer = await admin.hub('POST', `/backends/demo/members/${String(idOf(site, email))}/${action}`);
        expect(answer.status, `${email} ${action}`).toBeGreaterThanOrEqual(403);
        expect(answer.body).not.toContain('"token"');
      }
    }
    // An active account (it has a password) never gets a link through a member route, even when it only belongs here.
    await member(site, 'solo@example.com', 'viewer');
    const solo = idOf(site, 'solo@example.com');
    expect((await admin.hub('POST', `/backends/demo/members/${String(solo)}/reset-link`)).status).toBe(403);
    // Its TOTP can be reset by the admin, because the admin administers every backend it belongs to.
    expect((await admin.hub('POST', `/backends/demo/members/${String(solo)}/reset-totp`)).status).toBe(200);
    // The owner's route still works for all of them.
    expect((await site.owner.hub('POST', `/team/accounts/${String(solo)}/reset-link`)).status).toBe(200);
  });

  it('AC-LP-2 lets an admin issue a new link for an invitation that was not used yet', async () => {
    const site = await startSite();
    const admin = await member(site, 'admin@example.com', 'admin');
    const invited = await admin.hub('POST', '/backends/demo/members', { email: 'pending@example.com', role: 'viewer' });
    expect(invited.status).toBe(201);
    const id = idOf(site, 'pending@example.com');
    const link = await admin.hub('POST', `/backends/demo/members/${String(id)}/reset-link`);
    expect(link.status).toBe(200);
    expect(typeof (link.json().setup as { token: string }).token).toBe('string');
  });

  it('AC-LP-2 gives the adder no power over an existing account added to another backend', async () => {
    const site = await startSite();
    await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' });
    await member(site, 'victim@example.com', 'admin', 'other');
    const attacker = await member(site, 'attacker@example.com', 'admin');
    const victim = idOf(site, 'victim@example.com');
    // Adding the account to the attacker's own backend works, but it does not make it theirs.
    expect((await attacker.hub('POST', '/backends/demo/members', { email: 'victim@example.com', role: 'viewer' })).status).toBe(200);
    for (const action of ['reset-link', 'reset-totp']) expect((await attacker.hub('POST', `/backends/demo/members/${String(victim)}/${action}`)).status, action).toBe(403);
    expect((await attacker.hub('POST', `/team/accounts/${String(victim)}/reset-link`)).status).toBe(403);
    // The victim's password still works and no link exists for the account.
    expect((await site.browser().login('victim@example.com')).status).toBe(200);
    expect(site.team.store.hasOpenSetupToken(victim, new Date(site.clock.now).toISOString())).toBe(false);
  });
});

