import { createPublicKey, createVerify, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer, type Http2Server } from 'node:http2';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { pushSendAudit, pushUploadAudit } from '../src/admin-push.ts';
import { auditSummary } from '../src/audit.ts';
import { ADMIN_ROLE_TABLE, decide } from '../src/roles.ts';
import {
  APNS_PRODUCTION,
  APNS_SANDBOX,
  apnsToken,
  defaultPushTransport,
  fcmAssertion,
  FCM_SCOPE,
  FCM_TOKEN_URL,
  parseApnsKey,
  parseServiceAccount,
  PushError,
  PushService,
  type Http2Call,
  type HttpsCall,
  type PushTransport,
} from '../src/push.ts';
import { SecretStore } from '../src/secrets.ts';
import { exportSnapshot, importSnapshot } from '../src/snapshot.ts';
import { buildTestSnapshot } from '../src/test-snapshot.ts';

import { serve, stopAll, tempDir } from './helpers.ts';

afterEach(stopAll);

// Test keys are made here, at run time; nothing like a key is committed.
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = (key: KeyObject): string => key.export({ type: 'pkcs8', format: 'pem' }).toString();
const RSA_PEM = pem(rsa.privateKey);
const EC_PEM = pem(ec.privateKey);
const body64 = (text: string): string => text.split('\n').filter((line) => line !== '' && !line.startsWith('-----'))[2] ?? '';

const serviceAccount = { type: 'service_account', project_id: 'demo-project-1', client_email: 'push@demo-project-1.iam.gserviceaccount.com', private_key: RSA_PEM, private_key_id: 'abc123keyid' };
const apnsInput = { key: EC_PEM, keyId: 'ABC123DEFG', teamId: 'TEAM123456', bundleId: 'com.example.demo' };
const FCM_TOKEN = 'fcm-device-token-1234567890:APA91bTestTokenValue_abcdef';
const APNS_TOKEN = 'ab'.repeat(32);

const decode = (part: string): Record<string, unknown> => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

function verifyJwt(jwt: string, publicKey: KeyObject, algorithm: 'RSA-SHA256' | 'SHA256', ieee: boolean): { header: Record<string, unknown>; claims: Record<string, unknown>; valid: boolean } {
  const [head = '', claims = '', signature = ''] = jwt.split('.');
  const verifier = createVerify(algorithm).update(`${head}.${claims}`);
  const valid = verifier.verify(ieee ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey, Buffer.from(signature, 'base64url'));
  return { header: decode(head), claims: decode(claims), valid };
}

interface Rig {
  service: PushService;
  https: HttpsCall[];
  http2: Http2Call[];
  clock: { now: Date };
}

function rig(overrides: Partial<PushTransport> = {}, tokenReply: { status?: number; body?: unknown } = {}): Rig {
  const https: HttpsCall[] = [];
  const http2: Http2Call[] = [];
  const clock = { now: new Date('2025-01-01T00:00:00Z') };
  const transport: PushTransport = {
    https: (call) => {
      https.push(call);
      if (call.url === FCM_TOKEN_URL) return Promise.resolve({ status: tokenReply.status ?? 200, body: JSON.stringify(tokenReply.body ?? { access_token: `ya29.test-token-${String(https.length)}`, expires_in: 3600 }) });
      return Promise.resolve({ status: 200, body: JSON.stringify({ name: 'projects/demo-project-1/messages/0:123' }) });
    },
    http2: (call) => {
      http2.push(call);
      return Promise.resolve({ status: 200, headers: { 'apns-id': 'A-B-C' }, body: '' });
    },
    ...overrides,
  };
  const service = new PushService({ db: new DatabaseSync(':memory:'), secrets: new SecretStore(mkdtempSync(join(tmpdir(), 'push-'))), now: () => clock.now, transport });
  return { service, https, http2, clock };
}

describe('FCM HTTP v1', () => {
  it('AC-LP-9 signs an RS256 JWT with the scope and audience Google expects (verified against the test public key)', () => {
    const credentials = parseServiceAccount(serviceAccount);
    const { header, claims, valid } = verifyJwt(fcmAssertion(credentials, 1_700_000_000), createPublicKey(RSA_PEM), 'RSA-SHA256', false);
    expect(valid).toBe(true);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'abc123keyid' });
    expect(claims).toEqual({ iss: serviceAccount.client_email, scope: FCM_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: 1_700_000_000, exp: 1_700_003_600 });
  });

  it('AC-LP-9 exchanges the JWT for an access token, then POSTs the message to the project\'s messages:send', async () => {
    const r = rig();
    r.service.setFcm(serviceAccount);
    const result = await r.service.send({ platform: 'fcm', token: FCM_TOKEN, title: 'Hi', body: 'There', data: { orderId: 7, tag: 'x' } });
    expect(result).toMatchObject({ ok: true, status: 200 });
    const [exchange, send] = r.https;
    expect(exchange?.url).toBe('https://oauth2.googleapis.com/token');
    expect(exchange?.headers['content-type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(exchange?.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(verifyJwt(form.get('assertion') ?? '', createPublicKey(RSA_PEM), 'RSA-SHA256', false).valid).toBe(true);
    expect(send?.url).toBe('https://fcm.googleapis.com/v1/projects/demo-project-1/messages:send');
    expect(send?.headers.authorization).toBe('Bearer ya29.test-token-1');
    expect(JSON.parse(send?.body ?? '{}')).toEqual({
      message: { token: FCM_TOKEN, notification: { title: 'Hi', body: 'There' }, data: { orderId: '7', tag: 'x' }, android: { priority: 'HIGH' }, apns: { headers: { 'apns-priority': '10' } } },
    });
  });

  it('AC-LP-9 caches the access token until it is about to expire, then asks again', async () => {
    const r = rig();
    r.service.setFcm(serviceAccount);
    await r.service.send({ platform: 'fcm', token: FCM_TOKEN, title: 'a' });
    await r.service.send({ platform: 'fcm', token: FCM_TOKEN, title: 'b' });
    expect(r.https.filter((call) => call.url === FCM_TOKEN_URL)).toHaveLength(1);
    r.clock.now = new Date(r.clock.now.getTime() + 3600_000 - 30_000);
    await r.service.send({ platform: 'fcm', token: FCM_TOKEN, title: 'c' });
    expect(r.https.filter((call) => call.url === FCM_TOKEN_URL)).toHaveLength(2);
  });

  it('AC-LP-9 reports the provider reason and never echoes the device token', async () => {
    const r = rig({
      https: (call) =>
        Promise.resolve(call.url === FCM_TOKEN_URL ? { status: 200, body: '{"access_token":"ya29.x","expires_in":3600}' } : { status: 404, body: JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: `Requested entity was not found for ${FCM_TOKEN}` } }) }),
    });
    r.service.setFcm(serviceAccount);
    const result = await r.service.send({ platform: 'fcm', token: FCM_TOKEN });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.reason).toMatch(/^NOT_FOUND: Requested entity was not found/);
    expect(JSON.stringify(result)).not.toContain(FCM_TOKEN);
  });

  it('AC-LP-9 a refused service account is reported without crashing, and a missing one asks for an upload', async () => {
    const r = rig({}, { status: 400, body: { error: 'invalid_grant' } });
    r.service.setFcm(serviceAccount);
    expect(await r.service.send({ platform: 'fcm', token: FCM_TOKEN })).toMatchObject({ ok: false, status: 0, reason: expect.stringMatching(/Google refused/) as string });
    await expect(rig().service.send({ platform: 'fcm', token: FCM_TOKEN })).rejects.toThrow(/not set up/);
  });

  it('AC-LP-9 rejects a service account that is not one, and a token that is not a token', async () => {
    expect(() => parseServiceAccount({ type: 'authorized_user' })).toThrow(PushError);
    expect(() => parseServiceAccount({ ...serviceAccount, private_key: 'nope' })).toThrow(/usable key/);
    expect(() => parseServiceAccount('{not json')).toThrow(/not valid JSON/);
    expect(parseServiceAccount(JSON.stringify(serviceAccount)).projectId).toBe('demo-project-1');
    const r = rig();
    r.service.setFcm(serviceAccount);
    await expect(r.service.send({ platform: 'fcm', token: 'short' })).rejects.toThrow(PushError);
    await expect(r.service.send({ platform: 'fcm', token: `${FCM_TOKEN}/../x` })).rejects.toThrow(PushError);
  });
});

describe('APNs', () => {
  it('AC-LP-9 signs an ES256 provider token (raw r||s) with kid, iss and iat', () => {
    const { header, claims, valid } = verifyJwt(apnsToken(parseApnsKey(apnsInput), 1_700_000_000), createPublicKey(EC_PEM), 'SHA256', true);
    expect(valid).toBe(true);
    expect(header).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(claims).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 });
  });

  it('AC-LP-9 picks the sandbox or production host from the toggle and sends the topic, push type and priority headers', async () => {
    const r = rig();
    r.service.setApns(apnsInput);
    await r.service.send({ platform: 'apns', token: APNS_TOKEN, title: 'Hi', body: 'There', data: { orderId: 7 }, sandbox: true });
    await r.service.send({ platform: 'apns', token: APNS_TOKEN, title: 'Hi' });
    expect(r.http2.map((call) => call.origin)).toEqual([APNS_SANDBOX, APNS_PRODUCTION]);
    const [first] = r.http2;
    expect(first?.path).toBe(`/3/device/${APNS_TOKEN}`);
    expect(first?.headers).toMatchObject({ 'apns-topic': 'com.example.demo', 'apns-push-type': 'alert', 'apns-priority': '10' });
    expect(first?.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(first?.body ?? '{}')).toEqual({ aps: { alert: { title: 'Hi', body: 'There' } }, orderId: 7 });
  });

  it('AC-LP-9 a data-only push is a background push with priority 5', async () => {
    const r = rig();
    r.service.setApns(apnsInput);
    await r.service.send({ platform: 'apns', token: APNS_TOKEN, data: { sync: true } });
    expect(r.http2[0]?.headers).toMatchObject({ 'apns-push-type': 'background', 'apns-priority': '5' });
    expect(JSON.parse(r.http2[0]?.body ?? '{}')).toEqual({ aps: { 'content-available': 1 }, sync: true });
  });

  it('AC-LP-9 reuses the provider token for under 50 minutes, then makes a new one', async () => {
    const r = rig();
    r.service.setApns(apnsInput);
    const token = (): string => r.http2.at(-1)?.headers.authorization ?? '';
    await r.service.send({ platform: 'apns', token: APNS_TOKEN, title: 'a' });
    r.clock.now = new Date(r.clock.now.getTime() + 49 * 60_000);
    await r.service.send({ platform: 'apns', token: APNS_TOKEN, title: 'b' });
    expect(r.http2[0]?.headers.authorization).toBe(token());
    r.clock.now = new Date(r.clock.now.getTime() + 2 * 60_000);
    await r.service.send({ platform: 'apns', token: APNS_TOKEN, title: 'c' });
    expect(token()).not.toBe(r.http2[0]?.headers.authorization);
  });

  it('AC-LP-9 rejects a device token that is not hexadecimal (no path tricks) and a key that is not EC', async () => {
    const r = rig();
    r.service.setApns(apnsInput);
    for (const token of ['../../etc', `${APNS_TOKEN}/x`, 'zz'.repeat(32), 'ab']) await expect(r.service.send({ platform: 'apns', token })).rejects.toThrow(PushError);
    expect(() => parseApnsKey({ ...apnsInput, key: RSA_PEM })).toThrow(/EC/);
    expect(() => parseApnsKey({ ...apnsInput, keyId: 'short' })).toThrow(/key id/);
    expect(() => parseApnsKey({ ...apnsInput, bundleId: 'bad bundle' })).toThrow(/bundle/);
  });

  describe('over HTTP/2 (a mock server on localhost)', () => {
    let server: Http2Server | undefined;
    afterEach(() => void server?.close());

    it('AC-LP-9 sends the request with HTTP/2 pseudo-headers and reads the reason of a refusal', async () => {
      const seen: { headers: Record<string, unknown>; body: string }[] = [];
      server = createServer();
      server.on('stream', (stream, headers) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          seen.push({ headers, body: Buffer.concat(chunks).toString('utf8') });
          const bad = String(headers[':path']).endsWith('00'.repeat(32));
          stream.respond({ ':status': bad ? 400 : 200, 'apns-id': 'MOCK-ID' });
          stream.end(bad ? JSON.stringify({ reason: 'BadDeviceToken' }) : '');
        });
      });
      await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
      const address = server.address();
      const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? String(address.port) : '0'}`;
      const service = new PushService({ db: new DatabaseSync(':memory:'), secrets: new SecretStore(mkdtempSync(join(tmpdir(), 'push-'))), now: () => new Date(), transport: defaultPushTransport, apnsOrigin: () => origin });
      service.setApns(apnsInput);
      const good = await service.send({ platform: 'apns', token: APNS_TOKEN, title: 'Hi', body: 'There' });
      expect(good).toEqual({ ok: true, status: 200, response: { apnsId: 'MOCK-ID' } });
      expect(seen[0]?.headers).toMatchObject({ ':method': 'POST', ':path': `/3/device/${APNS_TOKEN}`, 'apns-topic': 'com.example.demo', 'apns-push-type': 'alert', 'apns-priority': '10' });
      expect(String(seen[0]?.headers.authorization)).toMatch(/^bearer /);
      const bad = await service.send({ platform: 'apns', token: '00'.repeat(32), title: 'Hi' });
      expect(bad).toMatchObject({ ok: false, status: 400, reason: 'BadDeviceToken' });
    });
  });
});

describe('push history and credentials', () => {
  it('AC-LP-9 keeps the last 50 sends with the token masked, and status shows only ids', async () => {
    const r = rig();
    r.service.setFcm(serviceAccount);
    r.service.setApns(apnsInput);
    for (let n = 0; n < 55; n += 1) await r.service.send({ platform: 'apns', token: APNS_TOKEN, title: String(n) });
    const history = r.service.history();
    expect(history).toHaveLength(50);
    expect(history[0]?.token).toBe('****abab');
    expect(JSON.stringify(history)).not.toContain(APNS_TOKEN);
    expect(r.service.status()).toEqual({ fcm: { configured: true, projectId: 'demo-project-1' }, apns: { configured: true, keyId: 'ABC123DEFG', teamId: 'TEAM123456', bundleId: 'com.example.demo' } });
    r.service.remove('fcm');
    r.service.remove('apns');
    expect(r.service.status()).toEqual({ fcm: { configured: false }, apns: { configured: false } });
  });

  it('AC-LP-9 the audit copy of an upload keeps no credential, and of a send no full token', () => {
    const upload = JSON.stringify(auditSummary(pushUploadAudit(apnsInput)));
    expect(upload).not.toContain(body64(EC_PEM));
    expect(upload).toContain('ABC123DEFG');
    expect(JSON.stringify(auditSummary(pushUploadAudit({ serviceAccount })))).not.toContain(body64(RSA_PEM));
    expect(JSON.stringify(pushSendAudit({ platform: 'fcm', token: FCM_TOKEN, title: 't' }))).not.toContain(FCM_TOKEN);
  });

  it('AC-LP-9 every push route needs the admin role', () => {
    const actor = { kind: 'account', id: '1', label: 'a' } as const;
    for (const route of ['GET /push', 'PUT /push/:platform', 'DELETE /push/:platform', 'POST /push/send']) {
      expect(ADMIN_ROLE_TABLE[route], route).toBe('admin');
      expect(decide({ actor, role: 'editor' }, route).ok).toBe(false);
      expect(decide({ actor, role: 'admin' }, route).ok).toBe(true);
    }
  });
});

describe('push credentials never leave the secrets file', () => {
  it('AC-LP-9 not in backend.json, logs, the audit, a request log, API answers, a test snapshot or an exported snapshot', async () => {
    const https: HttpsCall[] = [];
    const pushTransport: PushTransport = {
      https: (call) => {
        https.push(call);
        return Promise.resolve(call.url === FCM_TOKEN_URL ? { status: 200, body: '{"access_token":"ya29.live-access-token-xyz","expires_in":3600}' } : { status: 200, body: '{"name":"projects/demo-project-1/messages/1"}' });
      },
      http2: () => Promise.resolve({ status: 200, headers: {}, body: '' }),
    };
    const { dir, backend } = await serve({ name: 'push', collections: [{ name: 'notes', fields: [{ name: 'title', type: 'string' }] }] }, { pushTransport });
    const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
      fetch(`http://127.0.0.1:${backend.admin.port}/__admin${path}`, { method, headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const answers: string[] = [];
    const keep = async (response: Promise<Response>): Promise<Response> => {
      const r = await response;
      answers.push(await r.clone().text());
      return r;
    };
    expect((await keep(admin('/push/fcm', 'PUT', { serviceAccount }))).status).toBe(200);
    expect((await keep(admin('/push/apns', 'PUT', apnsInput))).status).toBe(200);
    expect((await keep(admin('/push/send', 'POST', { platform: 'fcm', token: FCM_TOKEN, title: 'Hi' }))).status).toBe(200);
    expect((await keep(admin('/push/send', 'POST', { platform: 'apns', token: APNS_TOKEN, title: 'Hi', sandbox: true }))).status).toBe(200);
    await keep(admin('/push'));
    expect((await keep(admin('/push/send', 'POST', { platform: 'apns', token: '../bad' }))).status).toBe(400);
    expect((await keep(admin('/push/fcm', 'PUT', { serviceAccount: { type: 'service_account' } }))).status).toBe(400);

    const secretsFile = readFileSync(join(dir, '.data', 'secrets.json'), 'utf8');
    expect(secretsFile).toContain(body64(RSA_PEM).slice(0, 40));
    expect(statSync(join(dir, '.data', 'secrets.json')).mode & 0o777).toBe(0o600);
    const needles = [body64(RSA_PEM).slice(0, 40), body64(EC_PEM).slice(0, 40), serviceAccount.client_email, 'ya29.live-access-token-xyz', FCM_TOKEN, APNS_TOKEN];
    const files = (root: string): string[] => readdirSync(root).flatMap((name) => (statSync(join(root, name)).isDirectory() ? files(join(root, name)) : [join(root, name)]));

    const zip = join(tempDir(), 'snapshot.zip');
    await exportSnapshot({ dir, db: backend.engine.store.db }, zip);
    const restored = join(tempDir(), 'restored');
    mkdirSync(restored);
    await importSnapshot(zip, restored);
    const outputs: Record<string, string> = {
      definition: readFileSync(join(dir, 'backend.json'), 'utf8'),
      logs: files(join(dir, '.data', 'logs')).map((file) => readFileSync(file, 'utf8')).join('\n'),
      requests: JSON.stringify(backend.engine.requests.snapshot()),
      answers: answers.join('\n'),
      testSnapshot: JSON.stringify(buildTestSnapshot({ dir, db: backend.engine.store.db, collections: ['notes'] })),
      exported: files(restored).map((file) => readFileSync(file).toString('latin1')).join('\n'),
      audit: JSON.stringify([auditSummary(pushUploadAudit({ serviceAccount })), auditSummary(pushUploadAudit(apnsInput)), auditSummary(pushSendAudit({ token: FCM_TOKEN }))]),
    };
    for (const [name, text] of Object.entries(outputs)) for (const needle of needles) expect(text, `${name} must not hold ${needle.slice(0, 12)}...`).not.toContain(needle);
    // The history in the live database shows masked tokens only, and the exported database has no history at all.
    expect(outputs.answers).toContain('****');
    expect(https.some((call) => call.headers.authorization === 'Bearer ya29.live-access-token-xyz')).toBe(true);
  });
});
