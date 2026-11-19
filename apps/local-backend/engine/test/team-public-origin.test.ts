import { afterEach, describe, expect, it } from 'vitest';

import { Browser, rawCall, startSite, stopTeams, type Site } from './team-helpers.ts';

afterEach(stopTeams);

describe('AC-LP-2 public APIs cannot attack the dashboard', () => {
  async function hostile(site: Site): Promise<void> {
    const def = (await site.owner.admin('demo', 'GET', '/definition')).json() as { endpoints: unknown[] };
    const put = await site.owner.admin('demo', 'PUT', '/definition', {
      ...def,
      endpoints: [
        ...def.endpoints,
        { id: 'evil', type: 'static', method: 'GET', path: '/evil', status: 200, headers: { 'content-type': 'text/html', 'set-cookie': 'tempo_session=planted; Path=/', 'content-security-policy': "default-src *" }, body: '<script>fetch("/__hub/me")</script>' },
        { id: 'svg', type: 'static', method: 'GET', path: '/svg', status: 200, headers: { 'content-type': 'image/svg+xml' }, body: '<svg onload="alert(1)"/>' },
      ],
    });
    expect(put.status, put.body).toBe(200);
  }

  it('AC-LP-2 sandboxes every public answer, makes pages and SVG downloads and drops cookies', async () => {
    const site = await startSite();
    await hostile(site);
    const page = await rawCall(site.team.port, { path: '/b/demo/evil' });
    expect(page.headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect(page.headers['content-disposition']).toBe('attachment');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(page.headers['set-cookie']).toBeUndefined();
    const svg = await rawCall(site.team.port, { path: '/b/demo/svg' });
    expect(svg.headers['content-disposition']).toBe('attachment');
    const json = await rawCall(site.team.port, { path: '/b/demo/products?limit=1' });
    expect(json.headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect(json.headers['content-disposition']).toBeUndefined();
    // Errors and the health check are hardened too; the engine's own docs keep what they need, still without cookies.
    expect((await rawCall(site.team.port, { path: '/b/demo/nothing-here' })).headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    const docs = await rawCall(site.team.port, { path: '/b/demo/__docs' });
    expect(docs.status).toBe(200);
    expect(docs.headers['content-disposition']).toBeUndefined();
    expect(docs.headers['set-cookie']).toBeUndefined();
  });

  it('AC-LP-2 keeps the dashboard cookie HttpOnly and SameSite=Strict on the whole site', async () => {
    const site = await startSite();
    const cookie = String((await site.browser().login('owner@example.com')).headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
  });

  it('AC-LP-2 serves the public APIs on their own origin when one is set, and nothing else there', async () => {
    const site = await startSite({ publicOrigin: 'https://api.example.com' });
    const onApi = (path: string) => rawCall(site.team.port, { path, headers: { host: 'api.example.com' } });
    const onDash = (path: string) => rawCall(site.team.port, { path, headers: { host: 'tempo.example.com' } });
    expect((await onApi('/b/demo/products?limit=1')).status).toBe(200);
    expect((await onApi('/__health')).status).toBe(200);
    for (const path of ['/', '/__session', '/__hub/me', '/__admin/b/demo/info']) expect((await onApi(path)).status, path).toBeGreaterThanOrEqual(404);
    const refused = await onDash('/b/demo/products');
    expect(refused.status).toBe(404);
    expect(refused.body).toContain('https://api.example.com');
    expect((await onDash('/__session')).status).toBe(200);
    // Members learn where the public APIs are.
    const me = (await new Browser(site.team.port, { host: 'tempo.example.com' }).hub('GET', '/me')).status;
    expect(me).toBe(401);
    expect((await site.owner.hub('GET', '/me')).json().publicOrigin).toBe('https://api.example.com');
  });
});
