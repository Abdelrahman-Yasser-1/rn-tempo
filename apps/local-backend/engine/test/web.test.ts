import { request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import type { AssetSources } from '../src/assets.ts';
import { DASHBOARD_CSP } from '../src/dashboard.ts';
import { jsonReply, problemReply } from '../src/http.ts';
import type { BackendHost } from '../src/hub.ts';
import { startWeb, type RunningWeb } from '../src/web.ts';
import { LoginCodes, Sessions } from '../src/web-auth.ts';

import { serve, stopAll } from './helpers.ts';

const FILES: Record<string, string> = { 'index.html': '<!doctype html><script type="module" src="/assets/app-abc123.js"></script>', 'assets/app-abc123.js': 'console.log(1)', 'assets/app-abc123.css': 'a{}' };
const assets: AssetSources = {
  isSea: () => false,
  getAsset: () => {
    throw new Error('not a single executable');
  },
  fromDisk: () => Buffer.alloc(0),
  dashboardFromDisk: (name) => {
    const text = FILES[name];
    if (text === undefined) throw new Error('missing');
    return Buffer.from(text);
  },
};

const host: BackendHost = {
  routes: [
    { method: 'GET', pattern: '/backends', handler: () => jsonReply(200, []) },
    { method: 'POST', pattern: '/ping', handler: () => jsonReply(200, { pong: true }) },
  ],
  admin: (id) =>
    id === 'shop'
      ? (req, res) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ url: req.url, method: req.method }));
          return Promise.resolve();
        }
      : problemReply(404, { detail: `No backend "${id}".` }),
};

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(port: number, options: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: options.method ?? 'GET', path: options.path, headers: options.headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.once('error', reject);
    req.end(options.body);
  });
}

const running: RunningWeb[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((web) => web.stop()));
  await stopAll();
});

async function web(options: Parameters<typeof startWeb>[0] = {}): Promise<RunningWeb> {
  const started = await startWeb({ host, assets, adminPort: 0, ...options });
  running.push(started);
  return started;
}

/** A browser's view: the cookie jar, the CSRF token, and the Origin it sends. */
async function login(site: RunningWeb): Promise<{ cookie: string; csrf: string; origin: string }> {
  const origin = `http://127.0.0.1:${String(site.port)}`;
  const answer = await call(site.port, { method: 'POST', path: '/__session', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ code: site.loginCode }) });
  expect(answer.status).toBe(200);
  const cookie = String(answer.headers['set-cookie']).split(';')[0] ?? '';
  return { cookie, csrf: (JSON.parse(answer.body) as { csrf: string }).csrf, origin };
}

describe('the login code (AC-LP-1)', () => {
  it('is single use', () => {
    const codes = new LoginCodes();
    const code = codes.issue();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
    expect(codes.redeem(code)).toEqual({ ok: true });
    expect(codes.redeem(code)).toEqual({ ok: false, reason: 'wrong' });
  });

  it('accepts the code in lower case and without the dash', () => {
    const codes = new LoginCodes();
    expect(codes.redeem(codes.issue().toLowerCase().replace('-', ' '))).toEqual({ ok: true });
  });

  it('expires after 10 minutes', () => {
    let now = 1_000_000;
    const codes = new LoginCodes({ clock: () => now });
    const code = codes.issue();
    now += 9 * 60_000 + 59_000;
    expect(codes.redeem('wrong')).toEqual({ ok: false, reason: 'wrong' });
    now += 2_000;
    expect(codes.redeem(code)).toEqual({ ok: false, reason: 'wrong' });
    const fresh = codes.issue();
    now += 599_000;
    expect(codes.redeem(fresh)).toEqual({ ok: true });
  });

  it('a new code replaces the old one', () => {
    const codes = new LoginCodes();
    const first = codes.issue();
    const second = codes.issue();
    expect(codes.redeem(first)).toEqual({ ok: false, reason: 'wrong' });
    expect(codes.redeem(second)).toEqual({ ok: true });
  });

  it('rate limits wrong tries, even for the right code, until the window passes', () => {
    let now = 5_000_000;
    const codes = new LoginCodes({ clock: () => now });
    const code = codes.issue();
    for (let i = 0; i < 5; i += 1) expect(codes.redeem(`nope${String(i)}`)).toEqual({ ok: false, reason: 'wrong' });
    const blocked = codes.redeem(code);
    expect(blocked).toMatchObject({ ok: false, reason: 'rate' });
    now += 61_000;
    expect(codes.redeem(code)).toEqual({ ok: true });
  });
});

describe('sessions (AC-LP-1)', () => {
  it('end after 12 hours without a request, and any request keeps them alive', () => {
    let now = 0;
    const sessions = new Sessions({ clock: () => now });
    const { id } = sessions.create();
    now += 11 * 3_600_000;
    expect(sessions.get(id)).toBeDefined();
    now += 11 * 3_600_000;
    expect(sessions.get(id)).toBeDefined();
    now += 12 * 3_600_000;
    expect(sessions.get(id)).toBeUndefined();
  });

  it('end when destroyed, and an unknown id is nothing', () => {
    const sessions = new Sessions();
    const { id } = sessions.create();
    sessions.destroy(id);
    expect(sessions.get(id)).toBeUndefined();
    expect(sessions.get('made-up')).toBeUndefined();
    expect(sessions.get(undefined)).toBeUndefined();
  });
});

describe('the web listener sign-in (AC-LP-1)', () => {
  it('exchanges the code for an HttpOnly, SameSite=Strict cookie (not Secure on plain loopback HTTP) and a CSRF token', async () => {
    const site = await web();
    const answer = await call(site.port, { method: 'POST', path: '/__session', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: site.loginCode }) });
    expect(answer.status).toBe(200);
    const cookie = String(answer.headers['set-cookie']);
    expect(cookie).toMatch(/^tempo_session=[A-Za-z0-9_-]{40,}; Path=\/; HttpOnly; SameSite=Strict$/);
    expect(cookie).not.toContain('Secure');
    const body = JSON.parse(answer.body) as { authenticated: boolean; csrf: string };
    expect(body.authenticated).toBe(true);
    expect(body.csrf.length).toBeGreaterThan(30);
    expect(answer.body).not.toContain(site.hub.token);
    expect(cookie).not.toContain(site.hub.token);
  });

  it('refuses a wrong or reused code and never sets a cookie', async () => {
    const site = await web();
    const wrong = await call(site.port, { method: 'POST', path: '/__session', body: JSON.stringify({ code: 'AAAAA-AAAAA' }) });
    expect(wrong.status).toBe(401);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    await login(site);
    const reused = await call(site.port, { method: 'POST', path: '/__session', body: JSON.stringify({ code: site.loginCode }) });
    expect(reused.status).toBe(401);
  });

  it('rate limits with 429 and Retry-After, and refuses the right code while limited', async () => {
    const site = await web();
    for (let i = 0; i < 5; i += 1) expect((await call(site.port, { method: 'POST', path: '/__session', body: JSON.stringify({ code: `BAD${String(i)}` }) })).status).toBe(401);
    const limited = await call(site.port, { method: 'POST', path: '/__session', body: JSON.stringify({ code: site.loginCode }) });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not take the code from a URL or a query string', async () => {
    const site = await web();
    const viaUrl = await call(site.port, { method: 'GET', path: `/__session?code=${site.loginCode}` });
    expect(JSON.parse(viaUrl.body)).toEqual({ authenticated: false, login: 'code' });
    const viaLogin = await call(site.port, { path: `/login?code=${site.loginCode}` });
    expect(viaLogin.headers['set-cookie']).toBeUndefined();
    expect((await call(site.port, { method: 'POST', path: '/__session', body: JSON.stringify({ code: site.loginCode }) })).status).toBe(200);
  });

  it('adds Secure to the cookie when the listener is behind TLS', async () => {
    const { createHub } = await import('../src/hub.ts');
    const hub = createHub({ host, assets, secureCookies: true });
    const code = hub.codes.issue();
    await new Promise<void>((done) => hub.server.listen(0, '127.0.0.1', done));
    const address = hub.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    try {
      const answer = await call(port, { method: 'POST', path: '/__session', headers: { origin: `https://127.0.0.1:${String(port)}` }, body: JSON.stringify({ code }) });
      expect(String(answer.headers['set-cookie'])).toMatch(/; HttpOnly; SameSite=Strict; Secure$/);
    } finally {
      hub.server.close();
    }
  });
});

describe('admin routes behind the session (AC-LP-1)', () => {
  it('need a session or the token', async () => {
    const site = await web();
    expect((await call(site.port, { path: '/__hub/backends' })).status).toBe(401);
    expect((await call(site.port, { path: '/__admin/b/shop/info' })).status).toBe(401);
    expect((await call(site.port, { path: '/__hub/backends', headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await call(site.port, { path: '/__hub/backends', headers: { authorization: `Bearer ${site.hub.token}` } })).status).toBe(200);
    const { cookie } = await login(site);
    expect((await call(site.port, { path: '/__hub/backends', headers: { cookie } })).status).toBe(200);
  });

  it('reach a backend through /__admin/b/<id> with the backend path rewritten', async () => {
    const site = await web();
    const { cookie } = await login(site);
    const answer = await call(site.port, { path: '/__admin/b/shop/data/products?limit=1', headers: { cookie } });
    expect(JSON.parse(answer.body)).toEqual({ url: '/__admin/data/products?limit=1', method: 'GET' });
    expect((await call(site.port, { path: '/__admin/b/other/info', headers: { cookie } })).status).toBe(404);
  });

  it('require the CSRF header on every mutating request made with the cookie', async () => {
    const site = await web();
    const { cookie, csrf, origin } = await login(site);
    const post = (headers: Record<string, string>) => call(site.port, { method: 'POST', path: '/__hub/ping', headers: { cookie, ...headers }, body: '{}' });
    expect((await post({ origin })).status).toBe(403);
    expect((await post({ origin, 'x-csrf-token': 'wrong' })).status).toBe(403);
    expect((await post({ origin, 'x-csrf-token': csrf })).status).toBe(200);
    const admin = (headers: Record<string, string>) => call(site.port, { method: 'DELETE', path: '/__admin/b/shop/data/x/1', headers: { cookie, ...headers } });
    expect((await admin({ origin })).status).toBe(403);
    expect((await admin({ origin, 'x-csrf-token': csrf })).status).toBe(200);
    // Reads need no CSRF header.
    expect((await call(site.port, { path: '/__hub/backends', headers: { cookie } })).status).toBe(200);
  });

  it('check the Origin of a mutating request: absent, other site or other port is refused', async () => {
    const site = await web();
    const { cookie, csrf, origin } = await login(site);
    const post = (headers: Record<string, string>) => call(site.port, { method: 'POST', path: '/__hub/ping', headers: { cookie, 'x-csrf-token': csrf, ...headers }, body: '{}' });
    expect((await post({})).status).toBe(403);
    expect((await post({ origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ origin: 'http://127.0.0.1:1' })).status).toBe(403);
    expect((await post({ origin: 'null' })).status).toBe(403);
    expect((await post({ origin, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ origin })).status).toBe(200);
  });

  it('check the Origin for the token too when one is sent, but do not demand one', async () => {
    const site = await web();
    const auth = { authorization: `Bearer ${site.hub.token}` };
    expect((await call(site.port, { method: 'POST', path: '/__hub/ping', headers: auth, body: '{}' })).status).toBe(200);
    expect((await call(site.port, { method: 'POST', path: '/__hub/ping', headers: { ...auth, origin: 'https://evil.example' }, body: '{}' })).status).toBe(403);
  });

  it('refuse a request whose Host is not loopback (DNS rebinding) on every path', async () => {
    const site = await web();
    for (const path of ['/', '/login', '/__session', '/__hub/backends', '/__admin/b/shop/info']) {
      const answer = await call(site.port, { path, headers: { host: 'rebind.example.com' } });
      expect(answer.status, path).toBe(403);
    }
    expect((await call(site.port, { path: '/', headers: { host: `localhost:${String(site.port)}` } })).status).toBe(200);
  });

  it('do not let a path climb out of the backend', async () => {
    const site = await web();
    const { cookie } = await login(site);
    for (const path of ['/__admin/b/shop/../other/info', '/__admin/b/shop/%2e%2e/other', '/__admin/b/shop/data%2f..%2fx', '/__admin/b/shop//info', '/__admin/b/shop/data%5c..']) {
      const answer = await call(site.port, { path, headers: { cookie } });
      expect([400, 404], path).toContain(answer.status);
      expect(answer.body, path).not.toContain('"url"');
    }
  });

  it('end the session on logout (cookie cleared, old cookie refused), which itself needs the CSRF header', async () => {
    const site = await web();
    const { cookie, csrf, origin } = await login(site);
    expect((await call(site.port, { method: 'DELETE', path: '/__session', headers: { cookie, origin } })).status).toBe(403);
    const out = await call(site.port, { method: 'DELETE', path: '/__session', headers: { cookie, origin, 'x-csrf-token': csrf } });
    expect(out.status).toBe(200);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await call(site.port, { path: '/__hub/backends', headers: { cookie } })).status).toBe(401);
    expect(JSON.parse((await call(site.port, { path: '/__session', headers: { cookie } })).body)).toEqual({ authenticated: false, login: 'code' });
  });

  it('end the session after 12 hours idle', async () => {
    let now = 10_000;
    const site = await web({ clock: () => now });
    const { cookie } = await login(site);
    now += 11 * 3_600_000;
    expect((await call(site.port, { path: '/__hub/backends', headers: { cookie } })).status).toBe(200);
    now += 12 * 3_600_000 + 1;
    expect((await call(site.port, { path: '/__hub/backends', headers: { cookie } })).status).toBe(401);
  });

  it('never put the token in an answer or a header', async () => {
    const site = await web();
    const { cookie } = await login(site);
    for (const path of ['/', '/login', '/__session', '/__hub/backends']) {
      const answer = await call(site.port, { path, headers: { cookie } });
      expect(JSON.stringify(answer)).not.toContain(site.hub.token);
    }
  });
});

describe('the dashboard files (AC-LP-1)', () => {
  it('serves the app at / and /login with a strict CSP, no inline script and no sniffing', async () => {
    const site = await web();
    for (const path of ['/', '/login']) {
      const answer = await call(site.port, { path });
      expect(answer.status).toBe(200);
      expect(String(answer.headers['content-type'])).toContain('text/html');
      expect(answer.headers['content-security-policy']).toBe(DASHBOARD_CSP);
      expect(answer.headers['cache-control']).toBe('no-cache');
      expect(answer.headers['x-content-type-options']).toBe('nosniff');
      expect(answer.headers['x-frame-options']).toBe('DENY');
    }
    expect(DASHBOARD_CSP).toContain("script-src 'self'");
    expect(DASHBOARD_CSP).toContain("connect-src 'self'");
    expect(DASHBOARD_CSP).not.toMatch(/script-src[^;]*unsafe/);
    expect(DASHBOARD_CSP).toContain("default-src 'self'");
  });

  it('caches hashed assets for a year, and serves the right types', async () => {
    const site = await web();
    const js = await call(site.port, { path: '/assets/app-abc123.js' });
    expect(js.status).toBe(200);
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(String(js.headers['content-type'])).toContain('text/javascript');
    expect(js.headers['content-security-policy']).toBe(DASHBOARD_CSP);
    expect(String((await call(site.port, { path: '/assets/app-abc123.css' })).headers['content-type'])).toContain('text/css');
  });

  it('answers 404 for files that are not there and for tricks, and never reads outside the dashboard', async () => {
    const site = await web();
    for (const path of ['/nope.js', '/assets/missing.js', '/..%2f..%2fpackage.json', '/assets/..%2f..%2fx', '/%2e%2e/x', '/assets/%00', '/__hub', '/__x']) {
      expect((await call(site.port, { path })).status, path).toBe(404);
    }
  });

  it('says so, with a 503, when the install has no dashboard', async () => {
    const site = await web({ assets: { ...assets, dashboardFromDisk: () => { throw new Error('missing'); } } });
    const answer = await call(site.port, { path: '/' });
    expect(answer.status).toBe(503);
    expect(answer.body).toContain('build:dashboard');
  });

  it('is served only by the admin listener: a backend public port answers 404 for the dashboard files', async () => {
    const { url } = await serve({ name: 'plain', collections: [], endpoints: [] });
    for (const path of ['/', '/login', '/assets/app-abc123.js', '/index.html', '/__session', '/__hub/backends']) {
      expect((await fetch(`${url}${path}`)).status, path).toBe(404);
    }
  });

  it('lets a backend answer at / when it defines an endpoint there', async () => {
    const { url } = await serve({ name: 'root', collections: [], endpoints: [{ id: 'root', method: 'GET', path: '/', type: 'static', status: 200, body: { hello: 'world' } }] });
    expect(await (await fetch(`${url}/`)).json()).toEqual({ hello: 'world' });
    expect((await fetch(`${url}/login`)).status).toBe(404);
  });
});

describe('the web listener (AC-LP-1)', () => {
  it('binds 127.0.0.1 only', async () => {
    const site = await web();
    const address = site.hub.server.address();
    expect(typeof address === 'object' && address !== null ? address.address : '').toBe('127.0.0.1');
  });

  it('refuses a port that was asked for when it is busy', async () => {
    const first = await web({ adminPort: 0 });
    await expect(startWeb({ host, assets, adminPort: first.port })).rejects.toThrow(/EADDRINUSE/);
  });
});

describe('AC-LP-6 the CSP lets Monaco run without weakening scripts', () => {
  it('AC-LP-6 allows inline styles only for styles, workers only from the same origin, and no eval or blob', () => {
    expect(DASHBOARD_CSP).toContain("style-src 'self' 'unsafe-inline'");
    expect(DASHBOARD_CSP).toContain("worker-src 'self'");
    expect(DASHBOARD_CSP).toMatch(/script-src 'self'(;|$)/);
    expect(DASHBOARD_CSP).not.toMatch(/unsafe-eval|blob:[^;]*worker|worker-src[^;]*blob/);
    expect(DASHBOARD_CSP).not.toMatch(/script-src[^;]*unsafe/);
    expect(DASHBOARD_CSP).not.toMatch(/https?:\/\/[a-z]/);
  });
});
