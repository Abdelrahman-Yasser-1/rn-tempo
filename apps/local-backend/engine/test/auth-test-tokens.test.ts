import { afterEach, describe, expect, it } from 'vitest';

import type { StartOptions } from '../src/app.ts';
import type { BackendInput } from '../src/schema.ts';
import { parseBackend } from '../src/schema.ts';

import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const FIXED = { username: 'emilys', accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' };

const definition = (): BackendInput => ({
  name: 'tokens',
  auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass' }, { username: 'other', password: 'otherpass' }] },
  endpoints: [
    { id: 'login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
    { id: 'refresh', type: 'auth', action: 'refresh', method: 'POST', path: '/auth/refresh' },
    { id: 'me', type: 'auth', action: 'me', method: 'GET', path: '/auth/me', auth: 'bearer' },
  ],
});

const post = (url: string, path: string, body: unknown): Promise<Response> => fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const me = (url: string, token: string): Promise<Response> => fetch(`${url}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
const login = async (url: string): Promise<Record<string, unknown>> => json(await post(url, '/auth/login', { username: 'emilys', password: 'emilyspass' }));

async function start(options: StartOptions = {}) {
  const running = await serve(definition(), { testMode: true, testTokens: FIXED, ...options });
  const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${running.backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { ...running, admin };
}

describe('the test kit\'s fixed tokens', () => {
  it('in test mode on a loopback listener, signing in as that user returns them, and they sign in and refresh', async () => {
    const { url } = await start();
    expect(await login(url)).toMatchObject({ username: 'emilys', accessToken: FIXED.accessToken, refreshToken: FIXED.refreshToken });
    const signedIn = await me(url, FIXED.accessToken);
    expect(signedIn.status).toBe(200);
    expect(await json(signedIn)).toMatchObject({ username: 'emilys' });
    expect(await json(await post(url, '/auth/refresh', { refreshToken: FIXED.refreshToken }))).toEqual({ accessToken: FIXED.accessToken, refreshToken: FIXED.refreshToken });
    expect((await post(url, '/auth/refresh', { refreshToken: 'something-else' })).status).toBe(401);
    expect((await me(url, 'mock-access-tokeX')).status).toBe(401);
    const other = await json(await post(url, '/auth/login', { username: 'other', password: 'otherpass' }));
    expect(other.accessToken).not.toBe(FIXED.accessToken);
    expect(await json(await me(url, String(other.accessToken)))).toMatchObject({ username: 'other' });
    expect((await post(url, '/auth/login', { username: 'emilys', password: 'wrong' })).status).toBe(400);
  });

  it('are ignored without test mode, off a loopback listener, and when a team server mounts the backend', async () => {
    for (const options of [{ testMode: false }, { host: '0.0.0.0' }, { mounted: { prefix: '/b/tokens' } }] as StartOptions[]) {
      const running = await start(options);
      const url = options.mounted === undefined ? running.url : undefined;
      if (url === undefined) {
        // A mounted backend has no listener of its own: ask the engine's own login instead.
        expect(running.backend.engine.auth.userFromToken(FIXED.accessToken)).toBeUndefined();
        continue;
      }
      const real = await login(url);
      expect(real.accessToken, JSON.stringify(options)).not.toBe(FIXED.accessToken);
      expect((await me(url, FIXED.accessToken)).status).toBe(401);
      expect((await post(url, '/auth/refresh', { refreshToken: FIXED.refreshToken })).status).toBe(401);
    }
  });

  it('are not a setting of backend.json: the definition refuses them', () => {
    expect(() => parseBackend({ name: 'x', auth: { testTokens: FIXED } } as unknown as BackendInput)).toThrow();
  });

  it('stop working when the user\'s tokens are revoked, the password changes or the user is disabled, and a new sign-in starts them again', async () => {
    const { url, admin } = await start();
    await login(url);
    expect((await me(url, FIXED.accessToken)).status).toBe(200);
    expect((await admin('/users/1/revoke', 'POST')).status).toBe(200);
    expect((await me(url, FIXED.accessToken)).status).toBe(401);
    expect((await post(url, '/auth/refresh', { refreshToken: FIXED.refreshToken })).status).toBe(401);
    await login(url);
    expect((await me(url, FIXED.accessToken)).status).toBe(200);
    expect((await admin('/users/1/password', 'POST', { password: 'a-new-password-1' })).status).toBe(200);
    expect((await me(url, FIXED.accessToken)).status).toBe(401);
    expect((await post(url, '/auth/login', { username: 'emilys', password: 'a-new-password-1' })).status).toBe(200);
    expect((await me(url, FIXED.accessToken)).status).toBe(200);
    expect((await admin('/users/1/disable', 'POST')).status).toBe(200);
    expect((await me(url, FIXED.accessToken)).status).toBe(401);
  });
});
