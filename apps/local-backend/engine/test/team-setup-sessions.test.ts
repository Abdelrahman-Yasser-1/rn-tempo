import { afterEach, describe, expect, it } from 'vitest';

import { member, PASSWORD, rawCall, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

const idOf = (site: Site, email: string): number => site.team.store.accountByEmail(email)?.id ?? 0;

describe('AC-LP-2 setup links end old sessions', () => {
  it('AC-LP-2 signs an account out everywhere when a password is chosen with a link', async () => {
    const site = await startSite();
    const viewer = await member(site, 'v@example.com', 'viewer');
    const id = idOf(site, 'v@example.com');
    expect((await viewer.hub('GET', '/me')).status).toBe(200);
    const link = (await site.owner.hub('POST', `/team/accounts/${String(id)}/reset-link`)).json() as { setup: { token: string } };
    const done = await rawCall(site.team.port, { method: 'POST', path: '/__setup', headers: { 'content-type': 'application/json', origin: site.owner.origin }, body: JSON.stringify({ token: link.setup.token, password: 'a brand new password' }) });
    expect(done.status).toBe(200);
    expect((await viewer.hub('GET', '/me')).status).toBe(401);
    expect((await site.browser().login('v@example.com', PASSWORD)).status).toBe(401);
    expect((await site.browser().login('v@example.com', 'a brand new password')).status).toBe(200);
  });
});

