import { createHash, createPublicKey, createVerify, randomBytes, type JsonWebKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ADMIN_ROLE_TABLE } from '../src/roles.ts';
import { parseBackend, type BackendInput } from '../src/schema.ts';

import { serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const REDIRECT = 'myapp://callback';
const definition = (oauth: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): BackendInput =>
  ({
    name: 'oauth',
    auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass', email: 'emily@example.com', firstName: 'Emily', lastName: 'Johnson', image: 'https://img.test/e.png' }, { username: 'michaelw', password: 'michaelwpass' }] },
    oauth: { enabled: true, provider: 'google', clients: [{ clientId: 'app-1', name: 'My App', redirectUris: [REDIRECT, 'https://app.test/cb'] }], ...oauth },
    endpoints: [{ id: 'get.me', type: 'auth', action: 'me', method: 'GET', path: '/auth/me', auth: 'bearer' }],
    ...extra,
  }) as BackendInput;

const verifierOf = (): string => randomBytes(48).toString('base64url');
const challengeOf = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

async function start(oauth: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, options: Parameters<typeof serve>[1] = {}) {
  const running = await serve(definition(oauth, extra), options);
  const authorizeQuery = (verifier: string, overrides: Record<string, string> = {}): URLSearchParams =>
    new URLSearchParams({ client_id: 'app-1', redirect_uri: REDIRECT, response_type: 'code', scope: 'openid profile email', state: 'st-1', nonce: 'n-1', code_challenge: challengeOf(verifier), code_challenge_method: 'S256', ...overrides });
  /** Signs in as a user on the authorize page (a form post) and returns the code. */
  const approve = async (verifier: string, userId = 1, overrides: Record<string, string> = {}): Promise<{ code: string; location: URL; status: number }> => {
    const form = authorizeQuery(verifier, overrides);
    form.set('user', String(userId));
    const answer = await fetch(`${running.url}/oauth/authorize`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'manual' });
    const location = new URL(answer.headers.get('location') ?? 'x://none');
    return { code: location.searchParams.get('code') ?? '', location, status: answer.status };
  };
  const token = (form: Record<string, string>, headers: Record<string, string> = {}): Promise<Response> =>
    fetch(`${running.url}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form) });
  return { ...running, authorizeQuery, approve, token };
}

describe('authorize page', () => {
  it('AC-LP-10 lists the app users and Deny with a strict CSP, no scripts, sandboxed', async () => {
    const { url, authorizeQuery } = await start();
    const page = await fetch(`${url}/oauth/authorize?${authorizeQuery(verifierOf())}`);
    expect(page.status).toBe(200);
    const csp = page.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('sandbox');
    expect(csp).not.toContain('script-src');
    const html = await page.text();
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('emilys');
    expect(html).toContain('michaelw');
    expect(html).toContain('Deny');
    expect(html).toContain('name="code_challenge"');
    expect(page.headers.get('x-frame-options')).toBe('DENY');
  });

  it('AC-LP-10 escapes what it shows, and never redirects to an unregistered redirect_uri (an exact match is required)', async () => {
    const { url, authorizeQuery, approve } = await start();
    for (const redirect of ['myapp://callback/', 'myapp://callback?x=1', 'https://app.test/cb/', 'https://evil.test/cb', 'MYAPP://callback', '']) {
      const verifier = verifierOf();
      const get = await fetch(`${url}/oauth/authorize?${authorizeQuery(verifier, { redirect_uri: redirect })}`, { redirect: 'manual' });
      expect(get.status, redirect).toBe(400);
      expect(get.headers.get('location')).toBeNull();
      const post = await approve(verifier, 1, { redirect_uri: redirect });
      expect(post.status, redirect).toBe(400);
    }
    const unknown = await fetch(`${url}/oauth/authorize?${authorizeQuery(verifierOf(), { client_id: 'nope' })}`, { redirect: 'manual' });
    expect(unknown.status).toBe(400);
    const xss = await fetch(`${url}/oauth/authorize?${authorizeQuery(verifierOf(), { state: '"><img src=x onerror=alert(1)>' })}`);
    expect(await xss.text()).not.toContain('<img src=x');
  });

  it('AC-LP-10 Deny redirects to the app with access_denied and the state', async () => {
    const { url, authorizeQuery } = await start();
    const form = authorizeQuery(verifierOf());
    form.set('deny', '1');
    const answer = await fetch(`${url}/oauth/authorize`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, redirect: 'manual' });
    expect(answer.status).toBe(302);
    const location = new URL(answer.headers.get('location') ?? '');
    expect(`${location.protocol}//${location.host}`).toBe('myapp://callback');
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('st-1');
  });

  it('AC-LP-10 PKCE with S256 is required: a missing or plain challenge is refused', async () => {
    const { approve } = await start();
    const verifier = verifierOf();
    expect((await approve(verifier, 1, { code_challenge_method: 'plain' })).location.searchParams.get('error')).toBe('invalid_request');
    expect((await approve(verifier, 1, { code_challenge: '' })).location.searchParams.get('error')).toBe('invalid_request');
    expect((await approve(verifier, 1, { response_type: 'token' })).location.searchParams.get('error')).toBe('unsupported_response_type');
  });
});

describe('code and token', () => {
  it('AC-LP-10 completes the authorization code flow with PKCE: a token, then userinfo, and the token works on the backend', async () => {
    const { url, approve, token } = await start();
    const verifier = verifierOf();
    const { code, location } = await approve(verifier);
    expect(location.searchParams.get('state')).toBe('st-1');
    const answer = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier });
    expect(answer.status).toBe(200);
    expect(answer.headers.get('cache-control')).toBe('no-store');
    const body = (await answer.json()) as { access_token: string; refresh_token: string; token_type: string; id_token: string; expires_in: number };
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(1800);
    const info = await fetch(`${url}/oauth/userinfo`, { headers: { authorization: `Bearer ${body.access_token}` } });
    expect(await info.json()).toEqual({ sub: '1', email: 'emily@example.com', email_verified: true, name: 'Emily Johnson', given_name: 'Emily', family_name: 'Johnson', picture: 'https://img.test/e.png' });
    expect((await fetch(`${url}/auth/me`, { headers: { authorization: `Bearer ${body.access_token}` } })).status).toBe(200);
    expect((await fetch(`${url}/oauth/userinfo`, { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await fetch(`${url}/oauth/userinfo`)).status).toBe(401);
  });

  it('AC-LP-10 rejects a wrong verifier, redirect and client, and an unknown or reused code', async () => {
    const { approve, token } = await start({ clients: [{ clientId: 'app-1', redirectUris: [REDIRECT] }, { clientId: 'app-2', redirectUris: ['https://two.test/cb'] }] });
    const verifier = verifierOf();
    const good = { grant_type: 'authorization_code', redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier };
    const bad = async (patch: Record<string, string>, expected: string): Promise<void> => {
      const { code } = await approve(verifier);
      const answer = await token({ ...good, code, ...patch });
      expect(answer.status, JSON.stringify(patch)).toBe(expected === 'invalid_client' ? 401 : 400);
      expect(((await answer.json()) as { error: string }).error).toBe(expected);
    };
    await bad({ code_verifier: verifierOf() }, 'invalid_grant');
    await bad({ code_verifier: 'short' }, 'invalid_grant');
    await bad({ redirect_uri: 'myapp://other' }, 'invalid_grant');
    await bad({ client_id: 'app-2' }, 'invalid_grant');
    await bad({ client_id: 'ghost' }, 'invalid_client');
    await bad({ code: 'unknown-code' }, 'invalid_grant');
    // A code that failed once is gone: the right verifier afterwards does not work either.
    const { code } = await approve(verifier);
    await token({ ...good, code, code_verifier: verifierOf() });
    expect((await token({ ...good, code })).status).toBe(400);
    // And a good code works once.
    const again = (await approve(verifier)).code;
    expect((await token({ ...good, code: again })).status).toBe(200);
    expect((await token({ ...good, code: again })).status).toBe(400);
    expect(((await (await token({ grant_type: 'password' })).json()) as { error: string }).error).toMatch(/invalid_client|unsupported_grant_type/);
  });

  it('AC-LP-10 a code expires after 60 seconds', async () => {
    const clock = { now: new Date('2025-01-01T00:00:00Z') };
    const { approve, token } = await start({}, {}, { now: () => clock.now });
    const verifier = verifierOf();
    const { code } = await approve(verifier);
    clock.now = new Date(clock.now.getTime() + 61_000);
    const answer = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier });
    expect(answer.status).toBe(400);
    const fresh = await approve(verifier);
    clock.now = new Date(clock.now.getTime() + 59_000);
    expect((await token({ grant_type: 'authorization_code', code: fresh.code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier })).status).toBe(200);
  });

  it('AC-LP-10 refresh_token gives a new pair and the old refresh token stops working', async () => {
    const { approve, token } = await start();
    const verifier = verifierOf();
    const first = (await (await token({ grant_type: 'authorization_code', code: (await approve(verifier)).code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier })).json()) as { refresh_token: string };
    const refreshed = await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: 'app-1' });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { access_token: string; refresh_token: string };
    expect(next.refresh_token).not.toBe(first.refresh_token);
    expect((await token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: 'app-1' })).status).toBe(400);
  });

  it('AC-LP-10 a client with a secret must present it (body or Basic); the secret is shown once and kept in secrets.json', async () => {
    const { dir, backend, approve, token } = await start();
    const admin = (path: string, method = 'GET'): Promise<Response> => fetch(`http://127.0.0.1:${backend.admin.port}/__admin${path}`, { method, headers: { authorization: `Bearer ${backend.admin.token}` } });
    const { secret } = (await (await admin('/oauth/clients/app-1/secret', 'POST')).json()) as { secret: string };
    expect(await (await admin('/oauth')).text()).not.toContain(secret);
    expect(readFileSync(join(dir, 'backend.json'), 'utf8')).not.toContain(secret);
    expect(readFileSync(join(dir, '.data', 'secrets.json'), 'utf8')).toContain(secret);
    const verifier = verifierOf();
    const form = (code: string): Record<string, string> => ({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier });
    expect((await token(form((await approve(verifier)).code))).status).toBe(401);
    expect((await token({ ...form((await approve(verifier)).code), client_secret: 'wrong' })).status).toBe(401);
    expect((await token({ ...form((await approve(verifier)).code), client_secret: secret })).status).toBe(200);
    expect((await token(form((await approve(verifier)).code), { authorization: `Basic ${Buffer.from(`app-1:${secret}`).toString('base64')}` })).status).toBe(200);
    await admin('/oauth/clients/app-1/secret', 'DELETE');
    expect((await token(form((await approve(verifier)).code))).status).toBe(200);
  });
});

describe('OpenID Connect', () => {
  it('AC-LP-10 the id_token is RS256-signed with the key in the JWKS, with the right claims; discovery points at the endpoints', async () => {
    const { url, approve, token } = await start();
    const discovery = (await (await fetch(`${url}/.well-known/openid-configuration`)).json()) as Record<string, unknown>;
    expect(discovery).toMatchObject({ authorization_endpoint: `${url}/oauth/authorize`, token_endpoint: `${url}/oauth/token`, userinfo_endpoint: `${url}/oauth/userinfo`, jwks_uri: `${url}/oauth/jwks`, code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['RS256'] });
    const verifier = verifierOf();
    const body = (await (await token({ grant_type: 'authorization_code', code: (await approve(verifier)).code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier })).json()) as { id_token: string };
    const [head = '', payload = '', signature = ''] = body.id_token.split('.');
    const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8')) as { alg: string; kid: string };
    const jwks = (await (await fetch(String(discovery.jwks_uri))).json()) as { keys: (JsonWebKey & { kid: string })[] };
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    expect(header.alg).toBe('RS256');
    expect(jwk).toBeDefined();
    const key = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
    expect(createVerify('RSA-SHA256').update(`${head}.${payload}`).verify(key, Buffer.from(signature, 'base64url'))).toBe(true);
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(claims).toMatchObject({ iss: url, aud: 'app-1', sub: '1', nonce: 'n-1', email: 'emily@example.com', email_verified: true, name: 'Emily Johnson' });
    expect(Number(claims.exp)).toBeGreaterThan(Number(claims.iat));
    // A tampered token does not verify.
    expect(createVerify('RSA-SHA256').update(`${head}.${Buffer.from('{"sub":"2"}').toString('base64url')}`).verify(key, Buffer.from(signature, 'base64url'))).toBe(false);
  });

  it('AC-LP-10 no id_token without the openid scope; the signing key is in secrets.json, not in the definition or the JWKS', async () => {
    const { url, dir, authorizeQuery, approve, token } = await start();
    void authorizeQuery;
    const verifier = verifierOf();
    const plain = (await (await token({ grant_type: 'authorization_code', code: (await approve(verifier, 1, { scope: 'profile' })).code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier })).json()) as Record<string, unknown>;
    expect(plain).not.toHaveProperty('id_token');
    const jwks = await (await fetch(`${url}/oauth/jwks`)).text();
    expect(jwks).not.toContain('"d"');
    expect(jwks).not.toContain('PRIVATE');
    expect(readFileSync(join(dir, '.data', 'secrets.json'), 'utf8')).toContain('PRIVATE KEY');
    expect(readFileSync(join(dir, 'backend.json'), 'utf8')).not.toContain('PRIVATE');
  });
});

describe('providers', () => {
  const login = async (provider: string): Promise<Record<string, unknown>> => {
    const { url, approve, token } = await start({ provider });
    const verifier = verifierOf();
    const body = (await (await token({ grant_type: 'authorization_code', code: (await approve(verifier)).code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier })).json()) as { access_token: string };
    return (await (await fetch(`${url}/oauth/userinfo`, { headers: { authorization: `Bearer ${body.access_token}` } })).json()) as Record<string, unknown>;
  };

  it('AC-LP-10 google, apple and github answer with their usual claim names', async () => {
    expect(Object.keys(await login('google')).sort()).toEqual(['email', 'email_verified', 'family_name', 'given_name', 'name', 'picture', 'sub']);
    expect(await login('apple')).toEqual({ sub: '1', email: 'emily@example.com', email_verified: 'true', is_private_email: 'false' });
    expect(await login('github')).toEqual({ sub: '1', id: 1, login: 'emilys', name: 'Emily Johnson', email: 'emily@example.com', avatar_url: 'https://img.test/e.png' });
  });
});

describe('configuration and roles', () => {
  it('AC-LP-10 is off unless enabled, and the schema checks the clients', async () => {
    const { url } = await serve({ ...definition({ enabled: false }) });
    expect((await fetch(`${url}/oauth/authorize?client_id=app-1`)).status).toBe(404);
    expect((await fetch(`${url}/.well-known/openid-configuration`)).status).toBe(404);
    expect(() => parseBackend({ name: 'x', oauth: { clients: [{ clientId: 'a', redirectUris: ['not a url'] }] } })).toThrow();
    expect(() => parseBackend({ name: 'x', oauth: { clients: [{ clientId: 'a', redirectUris: ['https://x.test/*'] }] } })).toThrow();
    expect(() => parseBackend({ name: 'x', oauth: { clients: [{ clientId: 'a', redirectUris: ['https://x.test/#frag'] }] } })).toThrow();
    expect(() => parseBackend({ name: 'x', oauth: { clients: [{ clientId: 'a', redirectUris: ['https://x.test'] }, { clientId: 'a', redirectUris: ['https://y.test'] }] } })).toThrow(/Duplicate/);
  });

  it('AC-LP-10 clients are managed by admins; the dashboard route lists the endpoints to paste into an app', async () => {
    expect(ADMIN_ROLE_TABLE['PUT /oauth']).toBe('admin');
    expect(ADMIN_ROLE_TABLE['POST /oauth/clients/:clientId/secret']).toBe('admin');
    expect(ADMIN_ROLE_TABLE['GET /oauth']).toBe('viewer');
    const { backend, url } = await start();
    const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
      fetch(`http://127.0.0.1:${backend.admin.port}/__admin${path}`, { method, headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const view = (await (await admin('/oauth')).json()) as { endpoints: { issuer: string; authorizationEndpoint: string }; clients: { clientId: string; secretConfigured: boolean }[] };
    expect(view.endpoints.issuer).toMatch(/^https?:\/\/localhost:\d+$/);
    expect(view.clients).toEqual([{ clientId: 'app-1', name: 'My App', redirectUris: [REDIRECT, 'https://app.test/cb'], secretConfigured: false }]);
    const put = await admin('/oauth', 'PUT', { enabled: true, provider: 'github', clients: [{ clientId: 'app-2', redirectUris: ['https://two.test/cb'] }] });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { provider: string }).provider).toBe('github');
    expect((await admin('/oauth', 'PUT', { clients: [{ clientId: 'x', redirectUris: ['nope'] }] })).status).toBe(400);
    expect((await admin('/oauth/clients/ghost/secret', 'POST')).status).toBe(404);
    void url;
  });

  it('AC-LP-10 token requests are logged by length only, and the log holds no code, verifier or token', async () => {
    const { backend, approve, token } = await start();
    const verifier = verifierOf();
    const { code } = await approve(verifier);
    const body = (await (await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: 'app-1', code_verifier: verifier })).json()) as { access_token: string; refresh_token: string };
    const log = JSON.stringify(backend.engine.requests.snapshot());
    for (const secret of [code, verifier, body.access_token, body.refresh_token]) expect(log).not.toContain(secret);
    expect(log).toMatch(/bytes of token request/);
  });
});
