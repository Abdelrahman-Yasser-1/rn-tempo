import { afterEach, describe, expect, it } from 'vitest';

import { TEST_FAULTS_HEADER, APP_SESSION_COOKIE } from '../src/constants.ts';
import { corsFor } from '../src/cors.ts';
import { RateLimiter } from '../src/faults.ts';
import { ADMIN_ROLE_TABLE, settingsChanged } from '../src/roles.ts';
import { parseBackend, type BackendInput } from '../src/schema.ts';
import { SESSION_COOKIE } from '../src/web-auth.ts';
import { vetAppCookie } from '../src/team-server.ts';

import { serve, stopAll } from './helpers.ts';
import { rawCall, startSite, stopTeams } from './team-helpers.ts';

afterEach(async () => {
  await stopAll();
  await stopTeams();
});

const hello = { id: 'get.hello', type: 'static', method: 'GET', path: '/hello', body: { hi: 'there' } };
const def = (extra: Record<string, unknown> = {}, endpoint: Record<string, unknown> = {}): BackendInput =>
  ({ name: 'faults', endpoints: [{ ...hello, ...endpoint }], ...extra }) as BackendInput;

describe('rate limits', () => {
  it('AC-LP-10 answers 429 with Retry-After and RateLimit headers after the limit, and counts down before it', async () => {
    const { url } = await serve(def({ faults: { rateLimit: { requests: 3, perSeconds: 60, key: 'global' } } }));
    const seen = [];
    for (let n = 0; n < 4; n += 1) seen.push(await fetch(`${url}/hello`));
    expect(seen.map((r) => r.status)).toEqual([200, 200, 200, 429]);
    expect(seen.map((r) => r.headers.get('ratelimit-remaining'))).toEqual(['2', '1', '0', '0']);
    expect(seen[0]?.headers.get('ratelimit-limit')).toBe('3');
    expect(seen[0]?.headers.get('ratelimit-policy')).toBe('3;w=60');
    expect(seen[3]?.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(Number(seen[3]?.headers.get('retry-after'))).toBeLessThanOrEqual(60);
    expect(seen[3]?.headers.get('ratelimit')).toBe(`limit=3, remaining=0, reset=${String(seen[3]?.headers.get('ratelimit-reset'))}`);
    expect(((await seen[3]?.json()) as { message: string }).message).toMatch(/Rate limit exceeded/);
  });

  it('AC-LP-10 the window resets after perSeconds', () => {
    const limiter = new RateLimiter();
    const limit = { requests: 2, perSeconds: 10 };
    expect(limiter.hit('a', limit, 0).allowed).toBe(true);
    expect(limiter.hit('a', limit, 1000).allowed).toBe(true);
    const blocked = limiter.hit('a', limit, 4000);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0, resetSec: 6 });
    expect(limiter.hit('a', limit, 10_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.hit('b', limit, 4000).allowed).toBe(true);
  });

  it('AC-LP-10 the window resets on the engine clock (running backend)', async () => {
    const clock = { now: new Date('2025-01-01T00:00:00Z') };
    const { url } = await serve(def({ faults: { rateLimit: { requests: 1, perSeconds: 30, key: 'ip' } } }), { now: () => clock.now });
    expect((await fetch(`${url}/hello`)).status).toBe(200);
    expect((await fetch(`${url}/hello`)).status).toBe(429);
    clock.now = new Date(clock.now.getTime() + 31_000);
    expect((await fetch(`${url}/hello`)).status).toBe(200);
  });

  it('AC-LP-10 key "user" counts each signed-in user on their own', async () => {
    const { url } = await serve({
      name: 'users',
      auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass' }, { username: 'michaelw', password: 'michaelwpass' }] },
      faults: { rateLimit: { requests: 1, perSeconds: 60, key: 'user' } },
      endpoints: [hello, { id: 'post.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login', faults: { rateLimit: null } }, { id: 'get.me', type: 'auth', action: 'me', method: 'GET', path: '/auth/me', auth: 'bearer', faults: { rateLimit: { requests: 1, perSeconds: 60, key: 'user' } } }],
    } as BackendInput);
    const login = async (username: string): Promise<string> =>
      ((await (await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: `${username}pass` }) })).json()) as { accessToken: string }).accessToken;
    const [a, b] = [await login('emilys'), await login('michaelw')];
    const me = (token: string): Promise<Response> => fetch(`${url}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    expect((await me(a)).status).toBe(200);
    expect((await me(a)).status).toBe(429);
    expect((await me(b)).status).toBe(200);
  });

  it('AC-LP-10 an endpoint setting replaces the backend default, and null turns an inherited limit off', async () => {
    const { url } = await serve({
      name: 'x',
      faults: { rateLimit: { requests: 1, perSeconds: 60, key: 'global' } },
      endpoints: [hello, { ...hello, id: 'get.free', path: '/free', faults: { rateLimit: null } }],
    } as BackendInput);
    expect([await fetch(`${url}/hello`), await fetch(`${url}/hello`)].map((r) => r.status)).toEqual([200, 429]);
    for (let n = 0; n < 4; n += 1) expect((await fetch(`${url}/free`)).status).toBe(200);
  });
});

describe('failure, drop and offline', () => {
  const statuses = async (seed: string, count: number, extra: Record<string, unknown> = {}): Promise<number[]> => {
    const { url } = await serve(def({ faults: { failureRate: 0.5, ...extra } }), { seed });
    const out: number[] = [];
    for (let n = 0; n < count; n += 1) out.push((await fetch(`${url}/hello`)).status);
    return out;
  };

  it('AC-LP-10 a 50% failure rate fails about half of 200 seeded requests, and the same seed repeats the run', async () => {
    const first = await statuses('seed-one', 200);
    const failed = first.filter((status) => status === 500).length;
    expect(failed).toBeGreaterThan(80);
    expect(failed).toBeLessThan(120);
    expect(first.every((status) => status === 500 || status === 200)).toBe(true);
    expect(await statuses('seed-one', 200)).toEqual(first);
    expect(await statuses('seed-two', 200)).not.toEqual(first);
  });

  it('AC-LP-10 failureStatus and failureBody shape the failure, and stats count it', async () => {
    const { url, backend } = await serve(def({ faults: { failureRate: 1, failureStatus: 503, failureBody: { error: 'busy' } } }));
    const answer = await fetch(`${url}/hello`);
    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({ error: 'busy' });
    expect(backend.engine.faultCounts.failed).toBe(1);
    const stats = (await (await fetch(`http://127.0.0.1:${backend.admin.port}/__admin/stats`, { headers: { authorization: `Bearer ${backend.admin.token}` } })).json()) as { faults: Record<string, number> };
    expect(stats.faults).toEqual({ rateLimited: 0, failed: 1, dropped: 0, offline: 0 });
  });

  it('AC-LP-10 dropRate destroys the connection in the middle of the answer', async () => {
    const { url, backend } = await serve(def({ faults: { dropRate: 1 } }));
    await expect((async () => (await fetch(`${url}/hello`)).text())()).rejects.toThrow();
    expect(backend.engine.faultCounts.dropped).toBe(1);
  });

  it('AC-LP-10 offline closes the connection at once; the engine\'s own health route still answers', async () => {
    const { url, backend } = await serve(def({ faults: { offline: true } }));
    await expect(fetch(`${url}/hello`)).rejects.toThrow();
    expect(backend.engine.faultCounts.offline).toBe(1);
    expect((await fetch(`${url}/__health`)).status).toBe(200);
    expect(backend.engine.requests.snapshot().some((entry) => entry.status === 0)).toBe(true);
  });

  it('AC-LP-10 slowDownload reuses the throttle: 4 KB at 64 kbps takes a while', async () => {
    const { url } = await serve(def({ faults: { slowDownload: 64 } }, { body: { text: 'x'.repeat(4000) } }));
    const began = Date.now();
    await (await fetch(`${url}/hello`)).text();
    expect(Date.now() - began).toBeGreaterThanOrEqual(350);
  });
});

describe('faults in test mode', () => {
  it('AC-LP-10 are off in test mode and on for a request that sends x-tempo-test-faults: 1', async () => {
    expect(TEST_FAULTS_HEADER).toBe('x-tempo-test-faults');
    const { url } = await serve(def({ faults: { failureRate: 1, rateLimit: { requests: 1, perSeconds: 60, key: 'global' } } }), { testMode: true });
    for (let n = 0; n < 3; n += 1) expect((await fetch(`${url}/hello`)).status).toBe(200);
    expect((await fetch(`${url}/hello`, { headers: { [TEST_FAULTS_HEADER]: '1' } })).status).toBe(500);
  });
});

describe('CORS', () => {
  const cors = (extra: Record<string, unknown>): BackendInput => def({ cors: extra });

  it('AC-LP-10 sends no CORS headers by default (today\'s behaviour), even for a preflight', async () => {
    const { url } = await serve(def());
    const preflight = await fetch(`${url}/hello`, { method: 'OPTIONS', headers: { origin: 'https://app.test', 'access-control-request-method': 'GET' } });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    expect((await fetch(`${url}/hello`, { headers: { origin: 'https://app.test' } })).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('AC-LP-10 answers a preflight 204 with methods, headers and max age, without the access key', async () => {
    const { url } = await serve({ ...cors({ origins: ['https://app.test'], methods: ['GET', 'POST'], headers: ['content-type', 'x-extra'], maxAge: 120, credentials: true }), publicAccess: 'open' } as BackendInput);
    const preflight = await fetch(`${url}/hello`, { method: 'OPTIONS', headers: { origin: 'https://app.test', 'access-control-request-method': 'POST' } });
    expect(preflight.status).toBe(204);
    expect(Object.fromEntries(preflight.headers)).toMatchObject({
      'access-control-allow-origin': 'https://app.test',
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type, x-extra',
      'access-control-max-age': '120',
      'access-control-allow-credentials': 'true',
      vary: 'Origin',
    });
    const real = await fetch(`${url}/hello`, { headers: { origin: 'https://app.test' } });
    expect(real.headers.get('access-control-allow-origin')).toBe('https://app.test');
    expect(real.headers.get('access-control-expose-headers')).toContain('retry-after');
    // Errors carry the headers too, so a page can read them.
    const missing = await fetch(`${url}/nope`, { headers: { origin: 'https://app.test' } });
    expect(missing.status).toBe(404);
    expect(missing.headers.get('access-control-allow-origin')).toBe('https://app.test');
    // Another origin gets nothing.
    expect((await fetch(`${url}/hello`, { headers: { origin: 'https://evil.test' } })).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('AC-LP-10 "*" answers * and no credentials; "*" with credentials is refused by the schema', async () => {
    const { url } = await serve(cors({ origins: '*' }));
    expect((await fetch(`${url}/hello`, { headers: { origin: 'https://any.test' } })).headers.get('access-control-allow-origin')).toBe('*');
    expect((await fetch(`${url}/hello`, { headers: { origin: 'https://any.test' } })).headers.get('access-control-allow-credentials')).toBeNull();
    expect(() => parseBackend({ name: 'x', cors: { origins: '*', credentials: true } })).toThrow(/Credentials cannot be allowed for every origin/);
    expect(() => parseBackend({ name: 'x', cors: { credentials: true } })).toThrow(/Credentials/);
    expect(parseBackend({ name: 'x', cors: { origins: ['https://a.test'], credentials: true } }).cors?.credentials).toBe(true);
    expect(() => parseBackend({ name: 'x', cors: { origins: ['https://a.test/path'] } })).toThrow();
  });

  it('AC-LP-10 corsFor ignores a request without an Origin header', () => {
    expect(corsFor(parseBackend({ name: 'x', cors: {} }).cors, 'GET', {}).headers).toEqual({});
  });
});

describe('cookie session mode', () => {
  const cookieDef = (mode: string, extra: Record<string, unknown> = {}): BackendInput =>
    ({
      name: 'cookies',
      auth: { mode, seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
      endpoints: [
        { id: 'post.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
        { id: 'post.logout', type: 'auth', action: 'logout', method: 'POST', path: '/auth/logout', auth: 'bearer' },
        { id: 'get.me', type: 'auth', action: 'me', method: 'GET', path: '/auth/me', auth: 'bearer' },
      ],
      ...extra,
    }) as BackendInput;
  const login = (url: string): Promise<Response> => fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) });
  const cookieOf = (response: Response): string => response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
  const csrfOf = (response: Response): string | undefined => /tempo_app_csrf=([^;]+)/.exec(response.headers.getSetCookie().join('\n'))?.[1];

  it('AC-LP-10 login sets an HttpOnly SameSite=Lax cookie scoped to the base path; a bearer endpoint accepts it; logout clears it', async () => {
    const { url } = await serve(cookieDef('cookie', { basePath: '/api' }));
    const answer = await login(`${url}/api`);
    const [header = '', csrfHeader = ''] = answer.headers.getSetCookie();
    expect(csrfHeader).toMatch(/^tempo_app_csrf=[\w-]+; Path=\/api; SameSite=Lax; Max-Age=1800$/);
    expect(header).toMatch(new RegExp(`^${APP_SESSION_COOKIE}=[\\w-]+\\.[\\w-]+\\.[\\w-]+; Path=/api; HttpOnly; SameSite=Lax; Max-Age=1800$`));
    expect(header).not.toContain('Secure');
    // In cookie mode scripts get no token.
    const parsed = (await answer.clone().json()) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('accessToken');
    expect(parsed.csrfToken).toBe(csrfOf(answer));
    const me = await fetch(`${url}/api/auth/me`, { headers: { cookie: cookieOf(answer) } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { username: string }).username).toBe('emilys');
    expect((await fetch(`${url}/api/auth/me`)).status).toBe(401);
    const out = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { cookie: cookieOf(answer), 'content-type': 'application/json', 'x-tempo-csrf': String(csrfOf(answer)) }, body: '{}' });
    expect(out.headers.getSetCookie()[0]).toMatch(/^tempo_app_session=; Path=\/api; HttpOnly; SameSite=Lax; Max-Age=0/);
  });

  it('AC-LP-10 mode bearer ignores the cookie and sets none; mode both takes either and keeps the tokens', async () => {
    const bearer = await serve(cookieDef('bearer'));
    const bearerLogin = await login(bearer.url);
    expect(bearerLogin.headers.get('set-cookie')).toBeNull();
    const token = ((await bearerLogin.json()) as { accessToken: string }).accessToken;
    expect((await fetch(`${bearer.url}/auth/me`, { headers: { cookie: `${APP_SESSION_COOKIE}=${token}` } })).status).toBe(401);
    expect((await fetch(`${bearer.url}/auth/me`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    const both = await serve(cookieDef('both'));
    const answer = await login(both.url);
    expect(answer.headers.getSetCookie()[0]).toContain(APP_SESSION_COOKIE);
    const body = (await answer.json()) as { accessToken: string };
    expect((await fetch(`${both.url}/auth/me`, { headers: { authorization: `Bearer ${body.accessToken}` } })).status).toBe(200);
    expect((await fetch(`${both.url}/auth/me`, { headers: { cookie: cookieOf(answer) } })).status).toBe(200);
  });

  it('AC-LP-10 on the team server the cookie is scoped to /b/<id>/, is the only one a backend may set, and never the dashboard\'s', async () => {
    expect(APP_SESSION_COOKIE).not.toBe(SESSION_COOKIE);
    const site = await startSite();
    const current = (await site.owner.admin('demo', 'GET', '/definition')).json();
    const base = { ...current, auth: { mode: 'cookie', seedUsers: [{ username: 'emilys', password: 'emilyspass' }] } };
    const endpoints = [
      ...(current.endpoints as unknown[]),
      { id: 'post.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
      { id: 'get.evil1', type: 'static', method: 'GET', path: '/evil1', headers: { 'set-cookie': 'tempo_session=stolen; Path=/; HttpOnly' }, body: {} },
      { id: 'get.evil2', type: 'static', method: 'GET', path: '/evil2', headers: { 'set-cookie': 'tempo_app_session=x; Path=/' }, body: {} },
      { id: 'get.evil3', type: 'static', method: 'GET', path: '/evil3', headers: { 'set-cookie': 'tempo_app_session=x; Path=/b/demo/; Domain=example.com' }, body: {} },
    ];
    const put = await site.owner.admin('demo', 'PUT', '/definition', { ...base, endpoints });
    expect(put.status, put.body).toBe(200);
    const answer = await rawCall(site.team.port, { method: 'POST', path: '/b/demo/auth/login', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) });
    expect(answer.status, answer.body).toBe(200);
    const cookies = ([] as string[]).concat(answer.headers['set-cookie'] ?? []);
    expect(cookies).toHaveLength(2);
    expect(cookies[1]).toMatch(/^tempo_app_csrf=[\w-]+; Path=\/b\/demo\/; SameSite=Lax/);
    expect(cookies[0]).toMatch(/^tempo_app_session=[\w.-]+; Path=\/b\/demo\/; HttpOnly; SameSite=Lax/);
    for (const path of ['/b/demo/evil1', '/b/demo/evil2', '/b/demo/evil3']) expect((await rawCall(site.team.port, { path })).headers['set-cookie'], path).toBeUndefined();
    // The token works on the mounted API as a cookie.
    const me = await rawCall(site.team.port, { path: '/b/demo/products', headers: { cookie: String(cookies[0]).split(';')[0] ?? '' } });
    expect(me.status).toBe(200);
  });

  it('AC-LP-10 on the team server a backend in bearer mode can never set a cookie', async () => {
    const site = await startSite();
    const current = (await site.owner.admin('demo', 'GET', '/definition')).json();
    const endpoints = [...(current.endpoints as unknown[]), { id: 'get.evil', type: 'static', method: 'GET', path: '/evil', headers: { 'set-cookie': 'tempo_app_session=x; Path=/b/demo/' }, body: {} }];
    expect((await site.owner.admin('demo', 'PUT', '/definition', { ...current, endpoints })).status).toBe(200);
    expect((await rawCall(site.team.port, { path: '/b/demo/evil' })).headers['set-cookie']).toBeUndefined();
  });

  it('AC-LP-10 vetAppCookie keeps only the app cookie on its own path', () => {
    expect(vetAppCookie('tempo_app_session=a; Path=/b/x/; HttpOnly', '/b/x/')).toBeDefined();
    expect(vetAppCookie('tempo_app_session=a; Path=/b/y/; HttpOnly', '/b/x/')).toBeUndefined();
    expect(vetAppCookie('other=a; Path=/b/x/', '/b/x/')).toBeUndefined();
    expect(vetAppCookie('tempo_session=a; Path=/b/x/', '/b/x/')).toBeUndefined();
    expect(vetAppCookie('tempo_app_csrf=a; Path=/b/x/; SameSite=Lax', '/b/x/')).toBeDefined();
    expect(vetAppCookie('tempo_app_csrf=a; Path=/', '/b/x/')).toBeUndefined();
  });
});

describe('fault settings and roles', () => {
  it('AC-LP-10 faults, cors and the auth mode are admin settings', () => {
    expect(ADMIN_ROLE_TABLE['PUT /settings/faults']).toBe('admin');
    expect(settingsChanged({ name: 'x' }, { name: 'x', faults: { offline: true } })).toBe(true);
    expect(settingsChanged({ name: 'x' }, { name: 'x', cors: { origins: '*' } })).toBe(true);
    expect(settingsChanged({ name: 'x' }, { name: 'x', auth: { mode: 'cookie' } })).toBe(true);
    expect(settingsChanged({ name: 'x' }, { name: 'x', auth: { accessTtlMin: 5 } })).toBe(false);
  });
});

describe('CSRF protection of cookie sessions', () => {
  const cookieDef = (mode: string, cors?: Record<string, unknown>): BackendInput =>
    ({
      name: 'csrf',
      auth: { mode, seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
      ...(cors === undefined ? {} : { cors }),
      collections: [{ name: 'notes', fields: [{ name: 'title', type: 'string' }] }],
      endpoints: [
        { id: 'post.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
        { id: 'post.notes', type: 'crud', collection: 'notes', action: 'create', method: 'POST', path: '/notes', auth: 'bearer' },
        { id: 'get.notes', type: 'crud', collection: 'notes', action: 'list', method: 'GET', path: '/notes', auth: 'bearer' },
      ],
    }) as BackendInput;

  async function session(mode = 'cookie', cors?: Record<string, unknown>) {
    const running = await serve(cookieDef(mode, cors));
    const login = await fetch(`${running.url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) });
    const cookie = login.headers.getSetCookie()[0]?.split(';')[0] ?? '';
    const csrf = ((await login.json()) as { csrfToken: string }).csrfToken;
    const post = (headers: Record<string, string>): Promise<Response> => fetch(`${running.url}/notes`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: JSON.stringify({ title: 'a' }) });
    return { ...running, cookie, csrf, post };
  }

  it('AC-LP-10 a cookie-authenticated unsafe request without the CSRF header or a same-origin Origin is refused with 403', async () => {
    const { post, url, cookie } = await session();
    const none = await post({});
    expect(none.status).toBe(403);
    expect(none.headers.get('content-type')).toContain('problem+json');
    expect(await none.text()).toContain('x-tempo-csrf');
    expect((await post({ origin: 'https://evil.test' })).status).toBe(403);
    expect((await post({ origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ 'x-tempo-csrf': 'wrong-token' })).status).toBe(403);
    // Safe methods are not checked.
    expect((await fetch(`${url}/notes`, { headers: { cookie } })).status).toBe(200);
  });

  it('AC-LP-10 the double-submit header (the login\'s csrfToken) or a same-origin Origin lets it through', async () => {
    const { post, csrf, url } = await session();
    expect((await post({ 'x-tempo-csrf': csrf })).status).toBe(201);
    expect((await post({ origin: url })).status).toBe(201);
    expect((await post({ origin: url, 'sec-fetch-site': 'same-origin' })).status).toBe(201);
  });

  it('AC-LP-10 an origin in the cors list is allowed; "*" does not allow anybody; another site stays refused', async () => {
    const { post } = await session('cookie', { origins: ['https://app.test'], credentials: true });
    expect((await post({ origin: 'https://app.test', 'sec-fetch-site': 'cross-site' })).status).toBe(201);
    expect((await post({ origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    const star = await session('cookie', { origins: '*' });
    expect((await star.post({ origin: 'https://evil.test' })).status).toBe(403);
  });

  it('AC-LP-10 a token for one session does not work for another, and a bearer request needs no CSRF header', async () => {
    const a = await session('both');
    const b = await session('both');
    expect((await a.post({ 'x-tempo-csrf': b.csrf })).status).toBe(403);
    const bearer = await fetch(`${a.url}/notes`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.cookie.split('=')[1] ?? ''}` }, body: JSON.stringify({ title: 'x' }) });
    expect(bearer.status).toBe(201);
  });
});
