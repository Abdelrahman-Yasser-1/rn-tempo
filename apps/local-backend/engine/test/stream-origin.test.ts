import { afterEach, describe, expect, it } from 'vitest';

import type { BackendInput } from '../src/schema.ts';

import { serve, stopAll } from './helpers.ts';
import { endpoints, openSse, openWs } from './realtime-helpers.ts';
import { startSite, stopTeams } from './team-helpers.ts';

afterEach(async () => {
  await stopAll();
  await stopTeams();
});

const ALLOWED = 'https://app.example.com';

const definition = (): BackendInput => ({
  name: 'streams',
  auth: { mode: 'both', seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
  cors: { origins: [ALLOWED], credentials: true },
  endpoints: endpoints([
    { id: 'post.auth.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
    { id: 'get.ws', type: 'websocket', method: 'GET', path: '/ws', auth: 'bearer' },
    { id: 'get.live', type: 'sse', method: 'GET', path: '/live', auth: 'bearer' },
  ]),
});

async function signedIn() {
  const running = await serve(definition());
  const login = await fetch(`${running.url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) });
  expect(login.status).toBe(200);
  const cookies = login.headers.getSetCookie().map((cookie) => cookie.split(';')[0] ?? '');
  const { accessToken } = (await login.json()) as { accessToken: string };
  return { running, cookie: cookies.join('; '), accessToken, wsUrl: `ws://127.0.0.1:${String(running.backend.port)}/ws`, sseUrl: `${running.url}/live` };
}

describe('cookie-authenticated WebSockets and event streams check the Origin', () => {
  it('refuses a cookie upgrade with no Origin or another site\'s Origin, and accepts this server and a cors origin', async () => {
    const s = await signedIn();
    await expect(openWs(s.wsUrl, [], { headers: { cookie: s.cookie } })).rejects.toThrow('403');
    await expect(openWs(s.wsUrl, [], { headers: { cookie: s.cookie, origin: 'https://evil.example.net' } })).rejects.toThrow('403');
    await expect(openWs(s.wsUrl, [], { headers: { cookie: s.cookie, origin: s.running.url, 'sec-fetch-site': 'cross-site' } })).rejects.toThrow('403');
    (await openWs(s.wsUrl, [], { headers: { cookie: s.cookie, origin: s.running.url } })).close();
    (await openWs(s.wsUrl, [], { headers: { cookie: s.cookie, origin: ALLOWED } })).close();
  });

  it('refuses a cookie event stream with no Origin or another site\'s Origin, and accepts this server, a cors origin and a same-origin fetch', async () => {
    const s = await signedIn();
    expect((await openSse(s.sseUrl, { cookie: s.cookie })).status).toBe(403);
    expect((await openSse(s.sseUrl, { cookie: s.cookie, origin: 'https://evil.example.net' })).status).toBe(403);
    expect((await openSse(s.sseUrl, { cookie: s.cookie, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    for (const headers of [{ origin: s.running.url }, { origin: ALLOWED }, { 'sec-fetch-site': 'same-origin' }] as Record<string, string>[]) {
      const stream = await openSse(s.sseUrl, { cookie: s.cookie, ...headers });
      expect(stream.status, JSON.stringify(headers)).toBe(200);
      stream.close();
    }
  });

  it('does not touch bearer-authenticated connections, which carry no ambient credential', async () => {
    const s = await signedIn();
    (await openWs(s.wsUrl, [], { headers: { authorization: `Bearer ${s.accessToken}` } })).close();
    (await openWs(s.wsUrl, ['bearer', s.accessToken])).close();
    const stream = await openSse(s.sseUrl, { authorization: `Bearer ${s.accessToken}` });
    expect(stream.status).toBe(200);
    stream.close();
  });
});

describe('the team dashboard\'s event stream on a cookie', () => {
  it('needs this page\'s Origin (or a same-origin fetch), not another site\'s; an API key is unaffected', async () => {
    const site = await startSite();
    const url = `http://127.0.0.1:${String(site.team.port)}/__admin/b/demo/events`;
    const status = async (headers: Record<string, string>): Promise<number> => {
      const controller = new AbortController();
      const answer = await fetch(url, { headers: { accept: 'text/event-stream', ...headers }, signal: controller.signal });
      controller.abort();
      return answer.status;
    };
    expect(await status({ cookie: site.owner.cookie })).toBe(403);
    expect(await status({ cookie: site.owner.cookie, origin: 'https://evil.example.net' })).toBe(403);
    expect(await status({ cookie: site.owner.cookie, origin: site.owner.origin, 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(await status({ cookie: site.owner.cookie, origin: site.owner.origin })).toBe(200);
    expect(await status({ cookie: site.owner.cookie, 'sec-fetch-site': 'same-origin' })).toBe(200);
    const made = await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'k', scope: 'admin' });
    expect(await status({ authorization: `Bearer ${(made.json() as { key: string }).key}` })).toBe(200);
  });
});
