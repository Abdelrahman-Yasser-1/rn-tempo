import { afterEach, describe, expect, it } from 'vitest';

import { member, startSite, stopTeams } from './team-helpers.ts';
import { fixture } from './import-helpers.ts';

afterEach(stopTeams);

describe('AC-LP-5 import routes on a team server', () => {
  it('AC-LP-5 lets an editor preview and apply, and refuses a viewer both, without changing anything', async () => {
    const site = await startSite({ backend: false });
    await site.owner.hub('POST', '/backends', { id: 'api', name: 'Api', preset: 'empty' });
    const viewer = await member(site, 'view@example.com', 'viewer', 'api');
    const editor = await member(site, 'edit@example.com', 'editor', 'api');
    const body = { text: fixture('petstore-swagger2.json'), name: 'petstore.json' };
    for (const route of ['/import/preview', '/import/apply']) expect((await viewer.admin('api', 'POST', route, body)).status, route).toBe(403);
    const preview = await editor.admin('api', 'POST', '/import/preview', body);
    expect(preview.status, preview.body).toBe(200);
    expect((await editor.admin('api', 'GET', '/endpoints')).json()).toEqual([]);
    const applied = await editor.admin('api', 'POST', '/import/apply', body);
    expect(applied.status, applied.body).toBe(200);
    expect(((await editor.admin('api', 'GET', '/endpoints')).json() as unknown as unknown[]).length).toBe(5);
  });

  it('AC-LP-5 audits both, the refusal too, without keeping the whole file', async () => {
    const site = await startSite({ backend: false });
    await site.owner.hub('POST', '/backends', { id: 'api', name: 'Api', preset: 'empty' });
    const viewer = await member(site, 'view@example.com', 'viewer', 'api');
    const editor = await member(site, 'edit@example.com', 'editor', 'api');
    const body = { text: fixture('petstore-swagger2.json'), name: 'petstore.json' };
    await viewer.admin('api', 'POST', '/import/apply', body);
    await editor.admin('api', 'POST', '/import/preview', body);
    await editor.admin('api', 'POST', '/import/apply', body);
    const entries = site.team.audit.query({ backend: 'api', limit: 100 }).entries.filter((entry) => entry.action.startsWith('POST /import'));
    expect(entries.map((entry) => `${entry.action} ${String(entry.status)} ${entry.denied ? 'denied' : 'ok'} ${entry.actor.label}`).sort()).toEqual([
      'POST /import/apply 200 ok edit@example.com',
      'POST /import/apply 403 denied view@example.com',
      'POST /import/preview 200 ok edit@example.com',
    ]);
    const stored = JSON.stringify(entries);
    expect(stored).toContain('3696 characters');
    expect(stored).not.toContain('uploadPhoto');
    expect(stored.length).toBeLessThan(12_000);
  });
});
