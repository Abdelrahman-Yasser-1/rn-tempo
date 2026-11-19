import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ADMIN_ROLE_TABLE, HUB_ROLE_TABLE } from '../src/roles.ts';
import { TeamStore } from '../src/team-store.ts';
import { hotp, base32Encode, base32Decode, verifyTotp, totp, otpauthUri } from '../src/totp.ts';
import { ProxyTrust } from '../src/trust-proxy.ts';

import { Browser, member, PASSWORD, rawCall, startSite, stopTeams } from './team-helpers.ts';

afterEach(stopTeams);

const CLI = join(import.meta.dirname, '../src/cli.ts');

function runCli(args: string[], stdin: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? -1, out, err }));
    child.stdin.end(stdin);
  });
}

describe('AC-LP-2 owner bootstrap', () => {
  it('AC-LP-2 creates the owner only from the CLI, reading the password from stdin, with a private secret file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lb-cli-'));
    try {
      const made = await runCli(['server', 'owner', 'create', '--email', 'Boss@Example.com', '--password-stdin', '--data-dir', dir], `${PASSWORD}\n`);
      expect(made.code).toBe(0);
      expect(made.out + made.err).not.toContain(PASSWORD);
      const again = await runCli(['server', 'owner', 'create', '--email', 'other@example.com', '--password-stdin', '--data-dir', dir], `${PASSWORD}\n`);
      expect(again.code).toBe(1);
      expect(again.err).toContain('already has an owner');
      expect(statSync(join(dir, 'server-secret.json')).mode & 0o777).toBe(0o600);
      const store = new TeamStore(dir);
      const accounts = store.listAccounts();
      store.close();
      expect(accounts.map((a) => [a.email, a.owner])).toEqual([['boss@example.com', true]]);
      expect(accounts[0]?.passwordHash?.startsWith('scrypt$')).toBe(true);
      const weak = await runCli(['server', 'owner', 'reset-password', '--email', 'boss@example.com', '--password-stdin', '--data-dir', dir], 'short\n');
      expect(weak.code).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('AC-LP-2 has no default account and no web route that makes an owner', async () => {
    const site = await startSite({ backend: false });
    const accounts = site.team.store.listAccounts();
    expect(accounts).toHaveLength(1);
    for (const guess of [['admin@example.com', 'admin'], ['owner@example.com', 'admin'], ['admin', 'password']]) {
      expect((await site.browser().login(guess[0] ?? '', guess[1])).status).toBe(401);
    }
    // Nothing on the network creates an account without a signed-in admin, and nobody creates an owner.
    const anonymous = new Browser(site.team.port);
    for (const [method, path] of [['POST', '/__hub/team/accounts'], ['POST', '/__hub/backends/x/members'], ['POST', '/__setup'], ['POST', '/__session']] as const) {
      const answer = await anonymous.call(method, path, { email: 'evil@example.com', password: PASSWORD, role: 'admin' });
      expect([400, 401, 404, 405]).toContain(answer.status);
    }
    expect(Object.keys(HUB_ROLE_TABLE).some((key) => /owner/i.test(key.split(' ')[1] ?? ''))).toBe(false);
    const viaMember = await member(await startSite({ backend: true }), 'v@example.com', 'admin');
    const promote = await viaMember.hub('POST', '/backends/demo/members', { email: 'x@example.com', role: 'owner' });
    expect(promote.status).toBe(400);
    expect(site.team.store.listAccounts().filter((a) => a.owner)).toHaveLength(1);
  });
});

describe('AC-LP-2 TOTP', () => {
  it('AC-LP-2 matches the RFC 6238 test vectors (SHA-1, 8 digits)', () => {
    const seed = Buffer.from('12345678901234567890');
    const vectors: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
    for (const [seconds, expected] of vectors) expect(hotp(seed, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it('AC-LP-2 accepts one step either side and no more, and round-trips base32', () => {
    const secret = Buffer.from('12345678901234567890');
    const now = 1_111_111_111_000;
    const code = totp(secret, now);
    expect(verifyTotp(secret, code, now)).toBeDefined();
    expect(verifyTotp(secret, code, now + 30_000)).toBeDefined();
    expect(verifyTotp(secret, code, now - 30_000)).toBeDefined();
    expect(verifyTotp(secret, code, now + 90_000)).toBeUndefined();
    expect(verifyTotp(secret, 'abcdef', now)).toBeUndefined();
    expect(base32Encode(secret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')?.toString()).toBe('12345678901234567890');
    expect(otpauthUri({ secret: 'ABC', account: 'a@b.co', issuer: 'Tempo Local Backend' })).toMatch(/^otpauth:\/\/totp\/Tempo%20Local%20Backend:a%40b\.co\?secret=ABC&issuer=/);
  });

  it('AC-LP-2 turns TOTP on, asks for the code at sign-in, refuses a replay and uses recovery codes once', async () => {
    const site = await startSite({ backend: false });
    const setup = (await site.owner.hub('POST', '/me/totp/setup')).json() as { secret: string; uri: string };
    expect(setup.uri).toContain('otpauth://totp/');
    const secret = base32Decode(setup.secret) as Buffer;
    expect((await site.owner.hub('POST', '/me/totp/enable', { code: '000000' })).status).toBe(400);
    const enabled = await site.owner.hub('POST', '/me/totp/enable', { code: totp(secret, site.clock.now) });
    expect(enabled.status).toBe(200);
    const codes = (enabled.json() as { recoveryCodes: string[] }).recoveryCodes;
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    // The secret is encrypted at rest: it is not in the database as text.
    const row = site.team.store.accountByEmail('owner@example.com');
    expect(row?.totpSecret?.startsWith('v1.')).toBe(true);
    expect(row?.totpSecret).not.toContain(setup.secret);

    const fresh = site.browser();
    const needCode = await fresh.login('owner@example.com');
    expect(needCode.status).toBe(401);
    expect(needCode.json().totpRequired).toBe(true);
    expect((await fresh.login('owner@example.com', PASSWORD, '123456')).status).toBe(401);
    // The code the setup used is already spent for this step; move to the next one.
    site.clock.now += 30_000;
    const code = totp(secret, site.clock.now);
    expect((await fresh.login('owner@example.com', PASSWORD, code)).status).toBe(200);
    expect((await site.browser().login('owner@example.com', PASSWORD, code)).status).toBe(401);
    const first = codes[0] ?? '';
    expect((await site.browser().login('owner@example.com', PASSWORD, first)).status).toBe(200);
    expect((await site.browser().login('owner@example.com', PASSWORD, first)).status).toBe(401);
    // Regenerating needs the password and gives ten new ones.
    expect((await fresh.hub('POST', '/me/recovery-codes', { password: 'wrong password!' })).status).toBe(403);
    expect(((await fresh.hub('POST', '/me/recovery-codes', { password: PASSWORD })).json() as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(10);
  });
});

describe('AC-LP-2 sign-in limits', () => {
  it('AC-LP-2 answers the same for an unknown email and a wrong password', async () => {
    const site = await startSite({ backend: false });
    const unknown = await site.browser().login('nobody@example.com', 'whatever password');
    const wrong = await site.browser().login('owner@example.com', 'whatever password');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toBe(wrong.body);
  });

  it('AC-LP-2 locks an email for 15 minutes after 5 failures, known or not', async () => {
    const site = await startSite({ backend: false, auth: { ipPerMinute: 1000 } });
    for (const email of ['owner@example.com', 'ghost@example.com']) {
      const b = site.browser();
      for (let i = 0; i < 5; i += 1) expect((await b.login(email, 'bad password here')).status).toBe(401);
      const locked = await b.login(email, PASSWORD);
      expect(locked.status).toBe(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    }
    site.clock.now += 15 * 60_000 + 1000;
    expect((await site.browser().login('owner@example.com')).status).toBe(200);
  });

  it('AC-LP-2 rate limits an IP address, and only a trusted proxy can name another one', async () => {
    const site = await startSite({ backend: false, auth: { ipPerMinute: 3 }, trustProxy: ['private'] });
    const b = site.browser({ 'x-forwarded-for': '203.0.113.9' });
    for (let i = 0; i < 3; i += 1) expect((await b.login(`u${String(i)}@example.com`, 'bad password here')).status).toBe(401);
    expect((await b.login('u9@example.com', 'bad password here')).status).toBe(429);
    // Another client address has its own budget.
    expect((await site.browser({ 'x-forwarded-for': '203.0.113.10' }).login('u9@example.com', 'bad password here')).status).toBe(401);
    // Without trust the header is ignored: the same socket address is used for everybody.
    const plain = await startSite({ backend: false, auth: { ipPerMinute: 2 } });
    for (const forged of ['1.1.1.1', '2.2.2.2']) await plain.browser({ 'x-forwarded-for': forged }).login('a@example.com', 'bad password here');
    expect((await plain.browser({ 'x-forwarded-for': '3.3.3.3' }).login('a@example.com', 'bad password here')).status).toBe(429);
  });

  it('AC-LP-2 parses proxy trust lists and ignores forwarded headers from other peers', () => {
    expect(() => new ProxyTrust(['nonsense'])).toThrow();
    expect(new ProxyTrust([]).enabled).toBe(false);
    const fake = (peer: string, headers: Record<string, string>): never => ({ socket: { remoteAddress: peer }, headers }) as never;
    const trust = new ProxyTrust(['10.0.0.0/8']);
    expect(trust.client(fake('10.1.2.3', { 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.7, 10.9.9.9' }))).toEqual({ ip: '198.51.100.7', https: true });
    expect(trust.client(fake('198.51.100.8', { 'x-forwarded-proto': 'https', 'x-forwarded-for': '1.2.3.4' }))).toEqual({ ip: '198.51.100.8', https: false });
    expect(trust.client(fake('::ffff:10.1.1.1', { 'x-forwarded-proto': 'http' })).https).toBe(false);
  });
});

describe('AC-LP-2 sessions', () => {
  it('AC-LP-2 marks the cookie Secure only behind a trusted proxy that says HTTPS', async () => {
    const trusted = await startSite({ backend: false, trustProxy: ['private'] });
    const viaProxy = await rawCall(trusted.team.port, {
      method: 'POST',
      path: '/__session',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https', origin: `https://127.0.0.1:${String(trusted.team.port)}` },
      body: JSON.stringify({ email: 'owner@example.com', password: PASSWORD }),
    });
    expect(viaProxy.status).toBe(200);
    const cookie = String(viaProxy.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    // Plain HTTP through the same proxy: no Secure.
    expect(String((await trusted.owner.login('owner@example.com')).headers['set-cookie'])).not.toContain('Secure');

    const untrusted = await startSite({ backend: false });
    const forged = await rawCall(untrusted.team.port, {
      method: 'POST',
      path: '/__session',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https', origin: `http://127.0.0.1:${String(untrusted.team.port)}` },
      body: JSON.stringify({ email: 'owner@example.com', password: PASSWORD }),
    });
    expect(forged.status).toBe(200);
    expect(String(forged.headers['set-cookie'])).not.toContain('Secure');
  });

  it('AC-LP-2 needs the CSRF token and a same-host Origin for a change, and ends with the sign-out', async () => {
    const site = await startSite({ backend: false });
    const withCookie = { cookie: site.owner.cookie, 'content-type': 'application/json' };
    const noCsrf = await rawCall(site.team.port, { method: 'POST', path: '/__hub/me/password', headers: { ...withCookie, origin: site.owner.origin }, body: '{}' });
    expect(noCsrf.status).toBe(403);
    const foreign = await rawCall(site.team.port, { method: 'POST', path: '/__hub/me/password', headers: { ...withCookie, origin: 'https://evil.example', 'x-csrf-token': site.owner.csrf }, body: '{}' });
    expect(foreign.status).toBe(403);
    expect((await site.owner.hub('GET', '/me')).status).toBe(200);
    expect((await site.owner.call('DELETE', '/__session')).status).toBe(200);
    expect((await site.owner.hub('GET', '/me')).status).toBe(401);
  });

  it('AC-LP-2 ends sessions when the account is disabled or its password changes', async () => {
    const site = await startSite();
    const viewer = await member(site, 'v@example.com', 'viewer');
    const second = site.browser();
    await second.login('v@example.com');
    const id = site.team.store.accountByEmail('v@example.com')?.id ?? 0;
    expect((await viewer.hub('POST', '/me/password', { currentPassword: 'nope nope nope', newPassword: 'another long one' })).status).toBe(403);
    expect((await viewer.hub('POST', '/me/password', { currentPassword: PASSWORD, newPassword: 'another long one' })).status).toBe(200);
    expect((await second.hub('GET', '/me')).status).toBe(401);
    expect((await viewer.hub('GET', '/me')).status).toBe(200);
    expect((await site.owner.hub('POST', `/team/accounts/${String(id)}/disable`)).status).toBe(200);
    expect((await viewer.hub('GET', '/me')).status).toBe(401);
    expect((await site.browser().login('v@example.com', 'another long one')).status).toBe(401);
  });
});

describe('AC-LP-2 invitations', () => {
  it('AC-LP-2 invites with a one-time link valid for 24 hours and gives a viewer', async () => {
    const site = await startSite();
    const invited = await site.owner.hub('POST', '/backends/demo/members', { email: 'New@Example.com', name: 'Nia', role: 'viewer' });
    expect(invited.status).toBe(201);
    const { setup } = invited.json() as { setup: { token: string; expiresAt: string } };
    expect(Date.parse(setup.expiresAt) - site.clock.now).toBe(24 * 60 * 60_000);
    // Until the link is used the account cannot sign in.
    expect((await site.browser().login('new@example.com', PASSWORD)).status).toBe(401);
    const post = (token: string, password: string) => rawCall(site.team.port, { method: 'POST', path: '/__setup', headers: { 'content-type': 'application/json', origin: site.owner.origin }, body: JSON.stringify({ token, password }) });
    expect((await post(setup.token, 'short')).status).toBe(400);
    expect((await post(setup.token, PASSWORD)).status).toBe(200);
    expect((await post(setup.token, PASSWORD)).status).toBe(400);
    expect((await site.browser().login('new@example.com', PASSWORD)).status).toBe(200);
    expect(site.team.store.membership(site.team.store.accountByEmail('new@example.com')?.id ?? 0, 'demo')?.role).toBe('viewer');
    // An expired link is refused.
    const again = (await site.owner.hub('POST', `/team/accounts/${String(site.team.store.accountByEmail('new@example.com')?.id)}/reset-link`)).json() as { setup: { token: string } };
    site.clock.now += 24 * 60 * 60_000 + 1000;
    expect((await post(again.setup.token, PASSWORD)).status).toBe(400);
  });

  it('AC-LP-2 lets an admin manage members of its backend but not the owner, itself or another admin', async () => {
    const site = await startSite();
    const admin = await member(site, 'admin@example.com', 'admin');
    await member(site, 'ed@example.com', 'editor');
    const edId = site.team.store.accountByEmail('ed@example.com')?.id ?? 0;
    const adminId = site.team.store.accountByEmail('admin@example.com')?.id ?? 0;
    const ownerId = site.team.store.accountByEmail('owner@example.com')?.id ?? 0;
    expect((await admin.hub('PUT', `/backends/demo/members/${String(edId)}`, { role: 'viewer' })).status).toBe(200);
    expect(site.team.store.membership(edId, 'demo')?.role).toBe('viewer');
    expect((await admin.hub('PUT', `/backends/demo/members/${String(adminId)}`, { role: 'viewer' })).status).toBe(403);
    expect((await admin.hub('DELETE', `/backends/demo/members/${String(ownerId)}`)).status).toBeGreaterThanOrEqual(403);
    expect((await admin.hub('POST', `/backends/demo/members/${String(edId)}/reset-totp`)).status).toBe(200);
    expect((await admin.hub('DELETE', `/backends/demo/members/${String(edId)}`)).status).toBe(200);
    expect(site.team.store.membership(edId, 'demo')).toBeUndefined();
    // An admin has no say over server-wide accounts.
    expect((await admin.hub('GET', '/team/accounts')).status).toBe(403);
    expect((await admin.hub('POST', `/team/accounts/${String(edId)}/disable`)).status).toBe(403);
  });
});

describe('AC-LP-2 role tables', () => {
  it('AC-LP-2 has a role for every admin route of a backend and none for a route that does not exist', async () => {
    const site = await startSite();
    const routes = site.team.registry.running('demo')?.adminRoutes ?? [];
    expect(routes.length).toBeGreaterThan(60);
    expect(routes.filter((route) => ADMIN_ROLE_TABLE[route] === undefined)).toEqual([]);
    expect(Object.keys(ADMIN_ROLE_TABLE).filter((entry) => !routes.includes(entry))).toEqual([]);
  });

  it('AC-LP-2 has a role for every server route and none for a route that does not exist', async () => {
    const site = await startSite();
    expect(site.team.hubRoutes.filter((route) => HUB_ROLE_TABLE[route] === undefined)).toEqual([]);
    expect(Object.keys(HUB_ROLE_TABLE).filter((entry) => !site.team.hubRoutes.includes(entry))).toEqual([]);
  });

  it('AC-LP-2 refuses an admin route that has no table entry for everyone but the owner', async () => {
    const { decide } = await import('../src/roles.ts');
    const access = (role: 'viewer' | 'editor' | 'admin' | 'owner') => ({ actor: { kind: 'account' as const, id: '1', label: 'x' }, role });
    expect(decide(access('admin'), 'GET /not-in-the-table').ok).toBe(false);
    expect(decide(access('owner'), 'GET /not-in-the-table').ok).toBe(true);
  });

  it('AC-LP-2 lets a viewer read and Try it but not change anything (403 in every area)', async () => {
    const site = await startSite();
    const viewer = await member(site, 'v@example.com', 'viewer');
    for (const path of ['/definition', '/endpoints', '/collections', '/data/products', '/users', '/media', '/content/types', '/scenarios', '/requests', '/stats']) {
      expect((await viewer.admin('demo', 'GET', path)).status, path).toBe(200);
    }
    const writes: [string, string, unknown][] = [
      ['POST', '/endpoints', { id: 'x' }],
      ['PUT', '/definition', {}],
      ['POST', '/collections', { name: 'x', fields: [] }],
      ['POST', '/data/products', { title: 'x' }],
      ['DELETE', '/data/products/1', undefined],
      ['POST', '/users', { username: 'zed', password: 'a long password' }],
      ['POST', '/content/types', { name: 'x' }],
      ['DELETE', '/media/abc', undefined],
      ['PUT', '/scenarios/x', { name: 'slow' }],
      ['POST', '/reload', undefined],
    ];
    for (const [method, path, body] of writes) expect((await viewer.admin('demo', method, path, body)).status, `${method} ${path}`).toBe(403);
    expect((await viewer.admin('demo', 'GET', '/snapshot')).status).toBe(403);
    expect((await viewer.hub('POST', '/backends/demo/try', { method: 'GET', path: '/products' })).status).toBe(200);
    expect((await viewer.hub('GET', '/backends/demo/engine-log')).status).toBe(200);
    for (const [method, path, body] of [['GET', '/backends/demo/members'], ['POST', '/backends/demo/members', { email: 'a@b.co', role: 'viewer' }], ['GET', '/backends/demo/api-keys'], ['POST', '/backends/demo/api-keys', { name: 'x', scope: 'admin' }], ['GET', '/backends/demo/audit'], ['POST', '/backends/demo/stop'], ['DELETE', '/backends/demo'], ['POST', '/backends/demo/certs'], ['POST', '/backends', { id: 'x', name: 'x' }], ['GET', '/team/accounts'], ['GET', '/audit']] as const) {
      expect((await viewer.hub(method, path, body)).status, `${method} ${path}`).toBe(403);
    }
  });

  it('AC-LP-2 lets an editor change the content of a backend but not its settings, snapshot or members', async () => {
    const site = await startSite();
    const editor = await member(site, 'e@example.com', 'editor');
    const created = await editor.admin('demo', 'POST', '/data/products', { title: 'Editor made this', price: 5 });
    expect(created.status, created.body).toBe(201);
    expect((await editor.admin('demo', 'GET', '/snapshot')).status).toBe(403);
    expect((await editor.hub('POST', '/backends/demo/members', { email: 'a@b.co', role: 'viewer' })).status).toBe(403);
    const definition = (await editor.admin('demo', 'GET', '/definition')).json();
    expect((await editor.admin('demo', 'PUT', '/definition', definition)).status).toBe(200);
    // Changing the public access mode is a setting: an editor may not, even with the whole definition.
    expect((await editor.admin('demo', 'PUT', '/definition', { ...definition, publicAccess: 'key' })).status).toBe(403);
    const admin = await member(site, 'a@example.com', 'admin');
    expect((await admin.admin('demo', 'GET', '/snapshot')).status).toBe(200);
    expect((await admin.admin('demo', 'PUT', '/definition', { ...definition, publicAccess: 'key' })).status).toBe(200);
  });

  it('AC-LP-2 shows a backend only to its members (404 to anyone else) and everything to the owner', async () => {
    const site = await startSite();
    expect((await site.owner.hub('POST', '/backends', { id: 'other', name: 'Other', preset: 'empty' })).status).toBe(201);
    const viewer = await member(site, 'v@example.com', 'viewer');
    expect((await viewer.hub('GET', '/backends')).json()).toEqual(expect.any(Array));
    const listed = ((await viewer.hub('GET', '/backends')).json() as unknown as { path: string }[]).map((b) => b.path);
    expect(listed).toEqual(['demo']);
    expect((await viewer.admin('other', 'GET', '/definition')).status).toBe(404);
    expect((await viewer.hub('GET', '/backends/other/engine-log')).status).toBe(404);
    expect(((await site.owner.hub('GET', '/backends')).json() as unknown as unknown[]).length).toBe(2);
    expect((await site.owner.admin('other', 'GET', '/definition')).status).toBe(200);
  });
});
