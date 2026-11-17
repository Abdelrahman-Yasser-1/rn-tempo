import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { json, serve, stopAll } from './helpers.ts';
import type { BackendInput } from '../src/schema.ts';

afterEach(stopAll);

// Shapes of the template's contract C13 (template/src/features/auth/api/schemas.ts and types). They are copied
// here because those files import the template's path aliases (@features, @shared), which this package
// does not resolve; the schemas are tiny and a drift shows up in the template's own Jest run.
const UserSchema = z.object({ id: z.number(), username: z.string(), email: z.string(), firstName: z.string(), lastName: z.string(), gender: z.string(), image: z.string() });
const LoginResponseSchema = UserSchema.extend({ accessToken: z.string(), refreshToken: z.string() });
const TokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });
const SuccessResponseSchema = z.object({ success: z.boolean() });
const OtpResendResponseSchema = z.object({ success: z.boolean(), retryAfterSec: z.number().int().nonnegative() });

const base: BackendInput = {
  name: 'auth',
  auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass', email: 'emily.johnson@x.dummyjson.com', firstName: 'Emily', lastName: 'Johnson', gender: 'female', image: 'https://example.test/emilys.png' }] },
  collections: [{ name: 'notes', fields: [{ name: 'text', type: 'string' }, { name: 'owner', type: 'number' }] }],
  endpoints: [
    { id: 'login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
    { id: 'refresh', type: 'auth', action: 'refresh', method: 'POST', path: '/auth/refresh' },
    { id: 'me', type: 'auth', action: 'me', method: 'GET', path: '/auth/me', auth: 'bearer' },
    { id: 'updateMe', type: 'auth', action: 'updateMe', method: 'PATCH', path: '/auth/me', auth: 'bearer' },
    { id: 'logout', type: 'auth', action: 'logout', method: 'POST', path: '/auth/logout', auth: 'bearer' },
    { id: 'register', type: 'auth', action: 'register', method: 'POST', path: '/auth/register' },
    { id: 'forgot', type: 'auth', action: 'forgotPassword', method: 'POST', path: '/auth/forgot-password' },
    { id: 'otpVerify', type: 'auth', action: 'otpVerify', method: 'POST', path: '/auth/otp/verify' },
    { id: 'otpResend', type: 'auth', action: 'otpResend', method: 'POST', path: '/auth/otp/resend' },
    { id: 'usersAdd', type: 'users', action: 'add', method: 'POST', path: '/users/add' },
    { id: 'usersGet', type: 'users', action: 'get', method: 'GET', path: '/users/:id', auth: 'bearer' },
    { id: 'usersPut', type: 'users', action: 'update', method: 'PUT', path: '/users/:id', auth: 'bearer' },
    { id: 'notesList', type: 'crud', collection: 'notes', action: 'list', method: 'GET', path: '/notes', auth: 'bearer', ownerField: 'owner' },
    { id: 'notesGet', type: 'crud', collection: 'notes', action: 'get', method: 'GET', path: '/notes/:id', auth: 'bearer', ownerField: 'owner' },
    { id: 'notesAdd', type: 'crud', collection: 'notes', action: 'create', method: 'POST', path: '/notes', auth: 'bearer', ownerField: 'owner' },
    { id: 'notesDel', type: 'crud', collection: 'notes', action: 'delete', method: 'DELETE', path: '/notes/:id', auth: 'bearer', ownerField: 'owner' },
  ],
};

const post = (url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

async function start(definition: BackendInput = base) {
  const running = await serve(definition);
  const admin = async (method: string, path: string, body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${running.backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const login = async (username = 'emilys', password = 'emilyspass', extra: Record<string, unknown> = {}): Promise<z.infer<typeof LoginResponseSchema>> => {
    const response = await post(`${running.url}/auth/login`, { username, password, ...extra });
    expect(response.status).toBe(200);
    return LoginResponseSchema.parse(await response.json());
  };
  return { ...running, admin, login };
}

const claims = (token: string): { sub: string; iat: number; exp: number } =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { sub: string; iat: number; exp: number };

describe('login, me and the C13 shapes', () => {
  it('logs in the seeded user with the exact C13 shape, and me returns the User', async () => {
    const { url, login } = await start();
    const session = await login();
    expect(session.username).toBe('emilys');
    expect(session.firstName).toBe('Emily');
    const me = await fetch(`${url}/auth/me`, { headers: bearer(session.accessToken) });
    expect(me.status).toBe(200);
    const user = UserSchema.parse(await me.json());
    expect(user).toEqual({ id: session.id, username: 'emilys', email: 'emily.johnson@x.dummyjson.com', firstName: 'Emily', lastName: 'Johnson', gender: 'female', image: 'https://example.test/emilys.png' });
  });

  it('answers wrong credentials with 400 and the dummyjson message, and an unknown user the same way', async () => {
    const { url } = await start();
    for (const body of [{ username: 'emilys', password: 'nope' }, { username: 'ghost', password: 'emilyspass' }]) {
      const response = await post(`${url}/auth/login`, body);
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ message: 'Invalid credentials' });
    }
    expect((await post(`${url}/auth/login`, { username: 'emilys' })).status).toBe(400);
  });

  it('honours expiresInMins and caps it', async () => {
    const { login } = await start();
    const short = claims((await login('emilys', 'emilyspass', { expiresInMins: 5 })).accessToken);
    expect(short.exp - short.iat).toBe(300);
    const capped = claims((await login('emilys', 'emilyspass', { expiresInMins: 9_999_999 })).accessToken);
    expect(capped.exp - capped.iat).toBe(60 * 60); // auth.maxAccessTtlMin defaults to 60
    const standard = claims((await login()).accessToken);
    expect(standard.exp - standard.iat).toBe(30 * 60);
  });

  it('clamps expiresInMins to auth.maxAccessTtlMin, and to the one-day hard cap', async () => {
    const low = await start({ ...base, auth: { ...base.auth, maxAccessTtlMin: 20 } });
    const clamped = claims((await low.login('emilys', 'emilyspass', { expiresInMins: 50 })).accessToken);
    expect(clamped.exp - clamped.iat).toBe(20 * 60);
    const refreshed = await post(`${low.url}/auth/refresh`, { refreshToken: (await low.login()).refreshToken, expiresInMins: 500 });
    const rotated = claims(TokensSchema.parse(await refreshed.json()).accessToken);
    expect(rotated.exp - rotated.iat).toBe(20 * 60);
    await stopAll();
    const high = await start({ ...base, auth: { ...base.auth, maxAccessTtlMin: 100_000 } });
    const day = claims((await high.login('emilys', 'emilyspass', { expiresInMins: 100_000 })).accessToken);
    expect(day.exp - day.iat).toBe(1440 * 60);
  });

  it('takes the lifetimes from backend.json auth', async () => {
    const { login } = await start({ ...base, auth: { ...base.auth, accessTtlMin: 10 } });
    const token = claims((await login()).accessToken);
    expect(token.exp - token.iat).toBe(600);
  });

  it('refuses a missing, made-up or tampered token on a bearer endpoint', async () => {
    const { url, login } = await start();
    const { accessToken } = await login();
    expect((await fetch(`${url}/auth/me`)).status).toBe(401);
    expect((await fetch(`${url}/auth/me`, { headers: bearer('abc.def.ghi') })).status).toBe(401);
    const [h, p, s] = accessToken.split('.') as [string, string, string];
    expect((await fetch(`${url}/auth/me`, { headers: bearer(`${h}.${p}.${s.slice(0, -2)}AA`) })).status).toBe(401);
  });
});

describe('refresh rotation', () => {
  it('rotates on every use, and reusing an old refresh token revokes the whole family with 401', async () => {
    const { url, login } = await start();
    const first = await login();
    const one = await post(`${url}/auth/refresh`, { refreshToken: first.refreshToken });
    expect(one.status).toBe(200);
    const second = TokensSchema.parse(await one.json());
    expect(second.refreshToken).not.toBe(first.refreshToken);
    const two = await post(`${url}/auth/refresh`, { refreshToken: second.refreshToken });
    expect(two.status).toBe(200);
    const third = TokensSchema.parse(await two.json());
    // The first token was revoked by its rotation; using it again is a replay.
    const replay = await post(`${url}/auth/refresh`, { refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    // ...and it took the newest token of the family down with it.
    expect((await post(`${url}/auth/refresh`, { refreshToken: third.refreshToken })).status).toBe(401);
    // A new sign-in is a new family and is unaffected.
    const other = await login();
    expect((await post(`${url}/auth/refresh`, { refreshToken: other.refreshToken })).status).toBe(200);
  });

  it('refuses an unknown refresh token and an expired one', async () => {
    const { url, login, backend } = await start();
    expect((await post(`${url}/auth/refresh`, { refreshToken: 'nope' })).status).toBe(401);
    const { refreshToken } = await login();
    backend.engine.store.db.prepare("UPDATE _refresh_tokens SET expiresAt = '2000-01-01T00:00:00.000Z'").run();
    expect((await post(`${url}/auth/refresh`, { refreshToken })).status).toBe(401);
  });

  it('stores only a sha256 of the refresh token', async () => {
    const { login, backend } = await start();
    const { refreshToken } = await login();
    const rows = backend.engine.store.db.prepare('SELECT tokenHash FROM _refresh_tokens').all();
    expect(rows).toHaveLength(1);
    expect(String(rows[0]?.tokenHash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(refreshToken);
  });

  it('logout revokes the session (with a token) or every session (without)', async () => {
    const { url, login } = await start();
    const a = await login();
    const b = await login();
    expect((await post(`${url}/auth/logout`, { refreshToken: a.refreshToken }, bearer(a.accessToken))).status).toBe(200);
    expect((await post(`${url}/auth/refresh`, { refreshToken: a.refreshToken })).status).toBe(401);
    expect((await post(`${url}/auth/refresh`, { refreshToken: b.refreshToken })).status).toBe(200);
    const c = await login();
    expect((await post(`${url}/auth/logout`, {}, bearer(c.accessToken))).status).toBe(200);
    expect((await post(`${url}/auth/refresh`, { refreshToken: c.refreshToken })).status).toBe(401);
    expect((await post(`${url}/auth/logout`, {})).status).toBe(401);
  });
});

describe('register, profile and the mocks', () => {
  it('registers a user who can then log in, and rejects a duplicate username', async () => {
    const { url, login } = await start();
    const created = await post(`${url}/auth/register`, { username: 'newbie', email: 'New@Example.test', password: 'secret1', confirmPassword: 'secret1', firstName: 'New', lastName: 'Bie' });
    expect(created.status).toBe(201);
    expect(UserSchema.parse(await created.json())).toMatchObject({ username: 'newbie', email: 'new@example.test', firstName: 'New' });
    expect((await login('newbie', 'secret1')).username).toBe('newbie');
    expect((await login('new@example.test', 'secret1')).username).toBe('newbie'); // the email works as a login too
    expect((await post(`${url}/auth/register`, { username: 'NEWBIE', password: 'secret1' })).status).toBe(409);
    expect((await post(`${url}/auth/register`, { username: 'x', password: '123' })).status).toBe(400);
  });

  it('updateMe changes profile fields, keeps custom ones in extra, and changing the password needs the current one', async () => {
    const { url, login } = await start();
    const { accessToken } = await login();
    const patch = await fetch(`${url}/auth/me`, { method: 'PATCH', headers: { ...bearer(accessToken), 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'Em', extra: { theme: 'dark' } }) });
    expect(patch.status).toBe(200);
    expect(await json(patch)).toMatchObject({ firstName: 'Em', theme: 'dark', username: 'emilys' });
    const change = (body: unknown): Promise<Response> => fetch(`${url}/auth/me`, { method: 'PATCH', headers: { ...bearer(accessToken), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await change({ password: 'brandnew1' })).status).toBe(400);
    expect((await change({ password: 'brandnew1', currentPassword: 'emilyspass' })).status).toBe(200);
    expect((await post(`${url}/auth/login`, { username: 'emilys', password: 'emilyspass' })).status).toBe(400);
    expect((await login('emilys', 'brandnew1')).username).toBe('emilys');
  });

  it('forgot password and OTP behave like the mocks', async () => {
    const { url } = await start({ ...base, auth: { ...base.auth, otpCode: '654321', otpResendSec: 45 } });
    expect(SuccessResponseSchema.parse(await (await post(`${url}/auth/forgot-password`, { email: 'nobody@example.test' })).json())).toEqual({ success: true });
    expect(await json(await post(`${url}/auth/otp/verify`, { target: 'a@b.co', code: '654321', purpose: 'register' }))).toEqual({ success: true });
    expect(await json(await post(`${url}/auth/otp/verify`, { target: 'a@b.co', code: '123456', purpose: 'register' }))).toEqual({ success: false });
    expect(OtpResendResponseSchema.parse(await (await post(`${url}/auth/otp/resend`, { target: 'a@b.co', purpose: 'reset-password' })).json())).toEqual({ success: true, retryAfterSec: 45 });
  });

  it('defaults the OTP code to 123456', async () => {
    const { url } = await start();
    expect(await json(await post(`${url}/auth/otp/verify`, { target: 'a@b.co', code: '123456', purpose: 'register' }))).toEqual({ success: true });
  });
});

describe('disabled users', () => {
  it('cannot sign in (403), and an access token already issued stops working at once', async () => {
    const { url, login, admin } = await start();
    const session = await login();
    expect((await admin('POST', `/users/${session.id}/disable`)).status).toBe(200);
    expect((await fetch(`${url}/auth/me`, { headers: bearer(session.accessToken) })).status).toBe(401);
    const blocked = await post(`${url}/auth/login`, { username: 'emilys', password: 'emilyspass' });
    expect(blocked.status).toBe(403);
    expect((await post(`${url}/auth/refresh`, { refreshToken: session.refreshToken })).status).toBe(401); // revoked by the disable
    expect((await admin('POST', `/users/${session.id}/enable`)).status).toBe(200);
    expect((await post(`${url}/auth/login`, { username: 'emilys', password: 'emilyspass' })).status).toBe(200);
  });

  it('a wrong password on a disabled account is still the 400, so the status does not confirm the account', async () => {
    const { url, admin } = await start();
    await admin('POST', '/users/1/disable');
    expect((await post(`${url}/auth/login`, { username: 'emilys', password: 'wrong' })).status).toBe(400);
  });
});

describe('users endpoints (C13 /users/add, /users/:id)', () => {
  it('adds a user without a password, reads it, and lets a signed-in user update only themselves', async () => {
    const { url, login } = await start();
    const added = await post(`${url}/users/add`, { username: 'carl', email: 'carl@example.test', firstName: 'Carl', lastName: 'C' });
    expect(added.status).toBe(201);
    const carl = UserSchema.parse(await added.json());
    expect((await fetch(`${url}/users/${carl.id}`)).status).toBe(401); // reading a profile needs a token
    expect((await post(`${url}/auth/login`, { username: 'carl', password: '' })).status).toBe(400); // no password set: cannot sign in
    const session = await login();
    const put = (id: number, body: unknown): Promise<Response> => fetch(`${url}/users/${id}`, { method: 'PUT', headers: { ...bearer(session.accessToken), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect(UserSchema.parse(await (await put(session.id, { firstName: 'Emilia', passwordHash: 'x', password: 'hacked1' })).json()).firstName).toBe('Emilia');
    expect((await put(carl.id, { firstName: 'Nope' })).status).toBe(403);
    const getAs = (id: number): Promise<Response> => fetch(`${url}/users/${id}`, { headers: bearer(session.accessToken) });
    expect((await getAs(session.id)).status).toBe(200);
    expect((await getAs(carl.id)).status).toBe(403);
    expect((await put(9999, { firstName: 'Nope' })).status).toBe(403); // other ids look the same, so ids cannot be probed
    expect((await post(`${url}/auth/login`, { username: 'emilys', password: 'hacked1' })).status).toBe(400); // password is not a profile field here
  });
});

describe('ownerField', () => {
  it('shows each user only their own rows and forces the owner on writes', async () => {
    const { url, login, admin } = await start();
    await admin('POST', '/users', { username: 'bob', password: 'bobspass1' });
    const emily = await login();
    const bob = await login('bob', 'bobspass1');
    const make = (token: string, text: string, owner?: number): Promise<Response> => post(`${url}/notes`, { text, ...(owner === undefined ? {} : { owner }) }, bearer(token));
    expect((await make(emily.accessToken, 'mine')).status).toBe(201);
    const stolen = await make(bob.accessToken, 'bobs', emily.id); // tries to write as Emily
    expect(await json(stolen)).toMatchObject({ owner: bob.id });
    const list = await json(await fetch(`${url}/notes`, { headers: bearer(emily.accessToken) }));
    expect((list.notes as { text: string }[]).map((note) => note.text)).toEqual(['mine']);
    expect(list.total).toBe(1);
    expect((await fetch(`${url}/notes/2`, { headers: bearer(emily.accessToken) })).status).toBe(404);
    expect((await fetch(`${url}/notes/2`, { method: 'DELETE', headers: bearer(emily.accessToken) })).status).toBe(404);
    expect((await fetch(`${url}/notes/2`, { headers: bearer(bob.accessToken) })).status).toBe(200);
    expect((await fetch(`${url}/notes`)).status).toBe(401);
  });

  it('is refused in backend.json without bearer auth or on a non-number field', async () => {
    const bad = { ...base, endpoints: [{ id: 'n', type: 'crud', collection: 'notes', action: 'list', method: 'GET', path: '/n', ownerField: 'owner' }] } satisfies BackendInput;
    await expect(start(bad as BackendInput)).rejects.toThrow(/ownerField needs auth/);
    const wrong = { ...base, endpoints: [{ id: 'n', type: 'crud', collection: 'notes', action: 'list', method: 'GET', path: '/n', auth: 'bearer', ownerField: 'text' }] } satisfies BackendInput;
    await expect(start(wrong as BackendInput)).rejects.toThrow(/number field/);
  });
});

describe('the password hash never leaks', () => {
  it('is absent from every public and admin response, and tokens and passwords are redacted in the request log', async () => {
    const { url, login, admin, backend } = await start();
    const session = await login();
    await post(`${url}/auth/register`, { username: 'leaky', password: 'leakypass1', email: 'l@x.test' });
    await post(`${url}/users/add`, { username: 'added', password: 'addedpass1' });
    const bodies: string[] = [];
    for (const path of ['/auth/me', '/users/1', '/users/2']) bodies.push(await (await fetch(`${url}${path}`, { headers: bearer(session.accessToken) })).text());
    for (const path of ['/users', '/users/1', '/users/2', '/sessions', '/data/notes', '/definition', '/info']) {
      const response = await admin('GET', path);
      bodies.push(await response.text());
    }
    expect((await admin('POST', '/users', { username: 'viaadmin', password: 'adminpass1' })).status).toBe(201);
    bodies.push(await (await admin('GET', '/users/4')).text());
    bodies.push(await (await admin('PUT', '/users/4', { firstName: 'X' })).text());
    for (const text of bodies) {
      expect(text).not.toMatch(/passwordHash/i);
      expect(text).not.toContain('scrypt$');
      expect(text).not.toContain('tokenHash');
    }
    // The admin definition carries the seed password the owner wrote in backend.json (their own file), but no hash.
    // Request log: passwords and tokens are redacted.
    const log = JSON.stringify(backend.engine.requests.snapshot(0));
    for (const secret of ['emilyspass', 'leakypass1', 'addedpass1', session.accessToken, session.refreshToken]) expect(log).not.toContain(secret);
    expect(log).toContain('[REDACTED]');
  });

  it('never returns the JWT secret from any route', async () => {
    const { dir, admin, url } = await start();
    const { readFileSync } = await import('node:fs');
    const secret = (JSON.parse(readFileSync(`${dir}/.data/secrets.json`, 'utf8')) as { jwtSecret: string }).jwtSecret;
    const seen: string[] = [];
    for (const path of ['/users', '/sessions', '/definition', '/info', '/requests', '/stats', '/endpoints']) seen.push(await (await admin('GET', path)).text());
    seen.push(await (await fetch(`${url}/__health`)).text());
    for (const text of seen) expect(text).not.toContain(secret);
  });
});

describe('admin: users and sessions', () => {
  it('lists, searches, creates, edits, resets the password, revokes and deletes', async () => {
    const { url, login, admin } = await start();
    const created = await admin('POST', '/users', { username: 'dana', password: 'danapass1', email: 'dana@example.test', firstName: 'Dana' });
    expect(created.status).toBe(201);
    const dana = (await json(created)) as { id: number; hasPassword: boolean };
    expect(dana.hasPassword).toBe(true);
    expect((await admin('POST', '/users', { username: 'dana', password: 'danapass1' })).status).toBe(409);
    const found = await json(await admin('GET', '/users?q=dan'));
    expect(found.total).toBe(1);
    expect((await json(await admin('GET', '/users'))).total).toBe(2);
    expect(await json(await admin('PATCH', `/users/${dana.id}`, { lastName: 'D' }))).toMatchObject({ lastName: 'D', firstName: 'Dana' });
    const session = await login('dana', 'danapass1');
    expect(((await json(await admin('GET', `/sessions?userId=${dana.id}`))).sessions as unknown[]).length).toBe(1);
    expect((await admin('POST', `/users/${dana.id}/password`, { password: 'newpass12' })).status).toBe(200);
    expect((await post(`${url}/auth/refresh`, { refreshToken: session.refreshToken })).status).toBe(401); // a reset signs out
    expect((await post(`${url}/auth/login`, { username: 'dana', password: 'danapass1' })).status).toBe(400);
    expect((await login('dana', 'newpass12')).id).toBe(dana.id);
    expect(await json(await admin('POST', `/users/${dana.id}/revoke`))).toMatchObject({ revoked: 1 });
    const sessions = (await json(await admin('GET', '/sessions'))).sessions as Record<string, unknown>[];
    expect(sessions.every((row) => !('tokenHash' in row))).toBe(true);
    expect((await admin('DELETE', `/users/${dana.id}`)).status).toBe(200);
    expect((await admin('GET', `/users/${dana.id}`)).status).toBe(404);
  });

  it('seeds users once: a deleted seed user is not brought back by a reload', async () => {
    const { admin } = await start();
    expect((await json(await admin('GET', '/users'))).total).toBe(1);
    expect((await admin('DELETE', '/users/1')).status).toBe(200);
    expect((await admin('POST', '/reload')).status).toBe(200);
    expect((await json(await admin('GET', '/users'))).total).toBe(0);
  });
});

describe('access tokens die with the user\'s tokenVersion', () => {
  const meStatus = async (url: string, token: string): Promise<number> => (await fetch(`${url}/auth/me`, { headers: bearer(token) })).status;

  it('changing the password in updateMe signs out every other session and hands the caller a fresh pair', async () => {
    const { url, login } = await start();
    const here = await login();
    const elsewhere = await login();
    const response = await fetch(`${url}/auth/me`, { method: 'PATCH', headers: { ...bearer(here.accessToken), 'content-type': 'application/json' }, body: JSON.stringify({ password: 'brandnew1', currentPassword: 'emilyspass' }) });
    expect(response.status).toBe(200);
    const fresh = LoginResponseSchema.parse(await response.json());
    expect(UserSchema.parse(fresh).username).toBe('emilys');
    // Everything issued before the change is dead: access and refresh tokens, the caller's own included.
    for (const old of [here, elsewhere]) {
      expect(await meStatus(url, old.accessToken)).toBe(401);
      expect((await post(`${url}/auth/refresh`, { refreshToken: old.refreshToken })).status).toBe(401);
    }
    // The fresh pair works.
    expect(await meStatus(url, fresh.accessToken)).toBe(200);
    expect((await post(`${url}/auth/refresh`, { refreshToken: fresh.refreshToken })).status).toBe(200);
  });

  it('a profile change without a password keeps sessions', async () => {
    const { url, login } = await start();
    const session = await login();
    await fetch(`${url}/auth/me`, { method: 'PATCH', headers: { ...bearer(session.accessToken), 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'Em' }) });
    expect(await meStatus(url, session.accessToken)).toBe(200);
  });

  it('an admin password reset, revoke and disable each invalidate access tokens already issued', async () => {
    const { url, login, admin } = await start();
    for (const [path, body] of [['/users/1/password', { password: 'resetpass1' }], ['/users/1/revoke', undefined], ['/users/1/disable', undefined]] as const) {
      await admin('POST', '/users/1/enable');
      const password = path.endsWith('password') ? 'emilyspass' : 'resetpass1';
      const session = await login('emilys', password);
      expect(await meStatus(url, session.accessToken), path).toBe(200);
      expect((await admin('POST', path, body)).status).toBe(200);
      expect(await meStatus(url, session.accessToken), path).toBe(401);
    }
  });

  it('logging out everywhere kills access tokens; logging out one session does not', async () => {
    const { url, login } = await start();
    const one = await login();
    const two = await login();
    await post(`${url}/auth/logout`, { refreshToken: one.refreshToken }, bearer(one.accessToken));
    expect(await meStatus(url, two.accessToken)).toBe(200);
    await post(`${url}/auth/logout`, {}, bearer(two.accessToken));
    expect(await meStatus(url, two.accessToken)).toBe(401);
    expect(await meStatus(url, one.accessToken)).toBe(401);
  });

  it('rejects a token whose ver is not the current tokenVersion', async () => {
    const { url, login, backend } = await start();
    const session = await login();
    backend.engine.store.db.prepare('UPDATE _users SET tokenVersion = tokenVersion + 1').run();
    expect(await meStatus(url, session.accessToken)).toBe(401);
    expect(claims(session.accessToken)).toMatchObject({ ver: 0 });
  });
});
