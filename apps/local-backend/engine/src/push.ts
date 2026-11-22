import { createPrivateKey, createSign, type KeyObject } from 'node:crypto';
import { connect as http2Connect } from 'node:http2';
import type { DatabaseSync } from 'node:sqlite';

import { maskTail } from './inbox.ts';
import type { SecretStore } from './secrets.ts';

export const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const APNS_PRODUCTION = 'https://api.push.apple.com';
export const APNS_SANDBOX = 'https://api.sandbox.push.apple.com';
/** Apple wants a provider token refreshed between every 20 and 60 minutes. */
export const APNS_TOKEN_MAX_AGE_MS = 50 * 60_000;
export const PUSH_HISTORY_KEEP = 50;
const TIMEOUT_MS = 10_000;

export class PushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushError';
  }
}

export interface HttpsCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}
export interface Http2Call {
  origin: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

/** The two ways push reaches the network. Tests inject fakes: nothing in the suite talks to Google or Apple. */
export interface PushTransport {
  https: (call: HttpsCall) => Promise<{ status: number; body: string }>;
  http2: (call: Http2Call) => Promise<{ status: number; headers: Record<string, string>; body: string }>;
}

export const defaultPushTransport: PushTransport = {
  https: async (call) => {
    const response = await fetch(call.url, { method: call.method, headers: call.headers, body: call.body, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: response.status, body: (await response.text()).slice(0, 4096) };
  },
  http2: (call) =>
    new Promise((resolve, reject) => {
      const session = http2Connect(call.origin);
      const fail = (error: Error): void => {
        session.destroy();
        reject(error);
      };
      const timer = setTimeout(() => fail(new PushError('The push service did not answer in time.')), TIMEOUT_MS);
      session.on('error', (error) => {
        clearTimeout(timer);
        fail(error);
      });
      const request = session.request({ ':method': 'POST', ':path': call.path, ...call.headers });
      const chunks: Buffer[] = [];
      let status = 0;
      const headers: Record<string, string> = {};
      request.on('response', (received) => {
        status = Number(received[':status'] ?? 0);
        for (const [name, value] of Object.entries(received)) if (!name.startsWith(':') && typeof value === 'string') headers[name] = value;
      });
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        clearTimeout(timer);
        session.close();
        resolve({ status, headers, body: Buffer.concat(chunks).toString('utf8').slice(0, 4096) });
      });
      request.on('error', (error) => {
        clearTimeout(timer);
        fail(error);
      });
      request.end(call.body);
    }),
};

// ---- credentials

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
}
export interface ApnsCredentials {
  key: string;
  keyId: string;
  teamId: string;
  bundleId: string;
}

const isText = (value: unknown, max = 100_000): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

/** Checks an uploaded service account JSON and keeps only the fields the sender needs. */
export function parseServiceAccount(input: unknown): FcmCredentials {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw new PushError('The service account is not valid JSON.');
    }
  }
  const account = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
  if (account === undefined || account.type !== 'service_account') throw new PushError('That is not a service account key (its "type" must be "service_account").');
  const { project_id: projectId, client_email: clientEmail, private_key: privateKey, private_key_id: privateKeyId } = account;
  if (!isText(projectId, 200) || !/^[a-z][a-z0-9-]{4,60}$/.test(projectId)) throw new PushError('The service account has no valid project_id.');
  if (!isText(clientEmail, 320) || !/^[^\s@]+@[^\s@]+$/.test(clientEmail)) throw new PushError('The service account has no valid client_email.');
  if (!isText(privateKey)) throw new PushError('The service account has no private_key.');
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new PushError('The private_key of the service account is not a usable key.');
  }
  return { projectId, clientEmail, privateKey, ...(isText(privateKeyId, 200) ? { privateKeyId } : {}) };
}

export function parseApnsKey(input: unknown): ApnsCredentials {
  const body = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const { key, keyId, teamId, bundleId } = body;
  if (!isText(key)) throw new PushError('Send the contents of the .p8 key as "key".');
  if (!isText(keyId, 10) || !/^[A-Z0-9]{10}$/.test(keyId)) throw new PushError('The key id is 10 letters and digits.');
  if (!isText(teamId, 10) || !/^[A-Z0-9]{10}$/.test(teamId)) throw new PushError('The team id is 10 letters and digits.');
  if (!isText(bundleId, 155) || !/^[A-Za-z0-9.-]+$/.test(bundleId)) throw new PushError('The bundle id looks like com.example.app.');
  try {
    const parsed = createPrivateKey(key);
    if (parsed.asymmetricKeyType !== 'ec') throw new Error('not ec');
  } catch {
    throw new PushError('The .p8 key is not a usable EC (P-256) private key.');
  }
  return { key, keyId, teamId, bundleId };
}

const b64 = (value: Buffer | string): string => Buffer.from(value).toString('base64url');

/** RS256 JWT for Google's OAuth2 JWT bearer flow. */
export function fcmAssertion(credentials: FcmCredentials, nowSec: number): string {
  const header = { alg: 'RS256', typ: 'JWT', ...(credentials.privateKeyId === undefined ? {} : { kid: credentials.privateKeyId }) };
  const claims = { iss: credentials.clientEmail, scope: FCM_SCOPE, aud: FCM_TOKEN_URL, iat: nowSec, exp: nowSec + 3600 };
  const signingInput = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(createPrivateKey(credentials.privateKey));
  return `${signingInput}.${b64(signature)}`;
}

/** ES256 provider token for APNs (the signature is the raw r||s form JWT wants). */
export function apnsToken(credentials: ApnsCredentials, nowSec: number): string {
  const signingInput = `${b64(JSON.stringify({ alg: 'ES256', kid: credentials.keyId }))}.${b64(JSON.stringify({ iss: credentials.teamId, iat: nowSec }))}`;
  const key: KeyObject = createPrivateKey(credentials.key);
  const signature = createSign('SHA256').update(signingInput).sign({ key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64(signature)}`;
}

// ---- sending

export type Platform = 'fcm' | 'apns';

export interface PushRequest {
  platform: Platform;
  token: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sandbox?: boolean;
}

export interface PushResult {
  ok: boolean;
  /** The provider's HTTP status (0 when there was no answer). */
  status: number;
  /** Why it failed, in the provider's words (`UNREGISTERED`, `BadDeviceToken`...). */
  reason?: string;
  /** The provider's answer with the device token and secrets removed. */
  response?: unknown;
}

export interface PushHistoryEntry {
  id: number;
  at: string;
  platform: Platform;
  token: string;
  status: number;
  ok: boolean;
  reason: string | null;
}

const FCM_TOKEN = /^[A-Za-z0-9:_-]{20,4096}$/;
const APNS_TOKEN = /^[0-9a-fA-F]{64,200}$/;

export interface PushDeps {
  db: DatabaseSync;
  secrets: SecretStore;
  now: () => Date;
  transport?: PushTransport;
  /** Tests: where APNs is (a local HTTP/2 server). */
  apnsOrigin?: (sandbox: boolean) => string;
}

/**
 * The push test sender: FCM HTTP v1 (OAuth2 JWT bearer, RS256) and APNs (token auth, ES256, HTTP/2). Credentials live in
 * `.data/secrets.json` under `push` and are never returned, logged or audited: callers see "configured" and ids. The last
 * 50 sends are kept (token masked).
 */
export class PushService {
  private readonly deps: PushDeps;
  private readonly transport: PushTransport;
  private fcmAccess: { token: string; expiresAt: number; account: string } | undefined;
  private apnsJwt: { token: string; issuedAt: number; key: string } | undefined;

  constructor(deps: PushDeps) {
    this.deps = deps;
    this.transport = deps.transport ?? defaultPushTransport;
    deps.db.exec('CREATE TABLE IF NOT EXISTS _push_history (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, platform TEXT NOT NULL, token TEXT NOT NULL, status INTEGER NOT NULL, ok INTEGER NOT NULL, reason TEXT)');
  }

  // credentials

  private section(): Record<string, unknown> {
    return this.deps.secrets.section('push');
  }

  fcm(): FcmCredentials | undefined {
    const raw = this.section().fcm;
    try {
      return raw === undefined ? undefined : parseServiceAccount({ type: 'service_account', project_id: (raw as Record<string, unknown>).projectId, client_email: (raw as Record<string, unknown>).clientEmail, private_key: (raw as Record<string, unknown>).privateKey, private_key_id: (raw as Record<string, unknown>).privateKeyId });
    } catch {
      return undefined;
    }
  }

  apns(): ApnsCredentials | undefined {
    const raw = this.section().apns;
    try {
      return raw === undefined ? undefined : parseApnsKey(raw);
    } catch {
      return undefined;
    }
  }

  setFcm(input: unknown): FcmCredentials {
    const credentials = parseServiceAccount(input);
    this.deps.secrets.setSection('push', (section) => {
      section.fcm = { ...credentials };
    });
    this.fcmAccess = undefined;
    return credentials;
  }

  setApns(input: unknown): ApnsCredentials {
    const credentials = parseApnsKey(input);
    this.deps.secrets.setSection('push', (section) => {
      section.apns = { ...credentials };
    });
    this.apnsJwt = undefined;
    return credentials;
  }

  remove(platform: Platform): boolean {
    const had = this.section()[platform] !== undefined;
    this.deps.secrets.setSection('push', (section) => {
      delete section[platform];
    });
    if (platform === 'fcm') this.fcmAccess = undefined;
    else this.apnsJwt = undefined;
    return had;
  }

  /** What the dashboard may show: whether each is set up, and the non-secret ids. */
  status(): { fcm: { configured: boolean; projectId?: string }; apns: { configured: boolean; keyId?: string; teamId?: string; bundleId?: string } } {
    const fcm = this.fcm();
    const apns = this.apns();
    return {
      fcm: fcm === undefined ? { configured: false } : { configured: true, projectId: fcm.projectId },
      apns: apns === undefined ? { configured: false } : { configured: true, keyId: apns.keyId, teamId: apns.teamId, bundleId: apns.bundleId },
    };
  }

  // sending

  async send(request: PushRequest): Promise<PushResult> {
    const tokenOk = request.platform === 'fcm' ? FCM_TOKEN.test(request.token) : APNS_TOKEN.test(request.token);
    if (!tokenOk) throw new PushError(request.platform === 'fcm' ? 'An FCM registration token is 20 to 4096 letters, digits, ":", "_" or "-".' : 'An APNs device token is 64 to 200 hexadecimal characters.');
    let result: PushResult;
    try {
      result = request.platform === 'fcm' ? await this.sendFcm(request) : await this.sendApns(request);
    } catch (error) {
      if (error instanceof PushError && /not set up/.test(error.message)) throw error;
      result = { ok: false, status: 0, reason: error instanceof PushError ? error.message : 'The push service could not be reached.' };
    }
    this.record(request, result);
    return result;
  }

  private cleanse(value: unknown, token: string): unknown {
    const text = JSON.stringify(value) ?? 'null';
    return JSON.parse(text.split(token).join(maskTail(token))) as unknown;
  }

  private async fcmAccessToken(credentials: FcmCredentials): Promise<string> {
    const nowMs = this.deps.now().getTime();
    const cached = this.fcmAccess;
    if (cached !== undefined && cached.account === credentials.clientEmail && cached.expiresAt - 60_000 > nowMs) return cached.token;
    const assertion = fcmAssertion(credentials, Math.floor(nowMs / 1000));
    const answer = await this.transport.https({
      url: FCM_TOKEN_URL,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
    });
    let parsed: { access_token?: unknown; expires_in?: unknown } = {};
    try {
      parsed = JSON.parse(answer.body) as typeof parsed;
    } catch {
      /* handled below */
    }
    if (answer.status !== 200 || typeof parsed.access_token !== 'string') throw new PushError(`Google refused the service account (${String(answer.status)}).`);
    const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 3600;
    this.fcmAccess = { token: parsed.access_token, expiresAt: nowMs + expiresIn * 1000, account: credentials.clientEmail };
    return parsed.access_token;
  }

  private async sendFcm(request: PushRequest): Promise<PushResult> {
    const credentials = this.fcm();
    if (credentials === undefined) throw new PushError('FCM is not set up: upload a service account first.');
    const access = await this.fcmAccessToken(credentials);
    const data = Object.fromEntries(Object.entries(request.data ?? {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
    const message = {
      token: request.token,
      ...(request.title === undefined && request.body === undefined ? {} : { notification: { ...(request.title === undefined ? {} : { title: request.title }), ...(request.body === undefined ? {} : { body: request.body }) } }),
      ...(Object.keys(data).length === 0 ? {} : { data }),
      android: { priority: 'HIGH' },
      apns: { headers: { 'apns-priority': '10' } },
    };
    const answer = await this.transport.https({
      url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.projectId)}/messages:send`,
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ message }),
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(answer.body);
    } catch {
      parsed = undefined;
    }
    const error = typeof parsed === 'object' && parsed !== null ? ((parsed as { error?: { status?: unknown; message?: unknown } }).error ?? undefined) : undefined;
    if (answer.status >= 200 && answer.status < 300) return { ok: true, status: answer.status, response: this.cleanse(parsed, request.token) };
    if (answer.status === 401) this.fcmAccess = undefined;
    const reason = error === undefined ? `HTTP ${String(answer.status)}` : `${typeof error.status === 'string' ? error.status : `HTTP ${String(answer.status)}`}${typeof error.message === 'string' ? `: ${error.message}` : ''}`;
    return { ok: false, status: answer.status, reason: String(this.cleanse(reason, request.token)), response: this.cleanse(parsed, request.token) };
  }

  private apnsProviderToken(credentials: ApnsCredentials): string {
    const nowMs = this.deps.now().getTime();
    const cached = this.apnsJwt;
    if (cached !== undefined && cached.key === `${credentials.keyId}:${credentials.teamId}` && nowMs - cached.issuedAt < APNS_TOKEN_MAX_AGE_MS) return cached.token;
    const token = apnsToken(credentials, Math.floor(nowMs / 1000));
    this.apnsJwt = { token, issuedAt: nowMs, key: `${credentials.keyId}:${credentials.teamId}` };
    return token;
  }

  private async sendApns(request: PushRequest): Promise<PushResult> {
    const credentials = this.apns();
    if (credentials === undefined) throw new PushError('APNs is not set up: upload a .p8 key first.');
    const silent = request.title === undefined && request.body === undefined;
    const aps = silent ? { 'content-available': 1 } : { alert: { ...(request.title === undefined ? {} : { title: request.title }), ...(request.body === undefined ? {} : { body: request.body }) } };
    const origin = (this.deps.apnsOrigin ?? ((sandbox: boolean): string => (sandbox ? APNS_SANDBOX : APNS_PRODUCTION)))(request.sandbox === true);
    const answer = await this.transport.http2({
      origin,
      path: `/3/device/${request.token.toLowerCase()}`,
      headers: {
        authorization: `bearer ${this.apnsProviderToken(credentials)}`,
        'apns-topic': credentials.bundleId,
        'apns-push-type': silent ? 'background' : 'alert',
        'apns-priority': silent ? '5' : '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps, ...(request.data ?? {}) }),
    });
    let parsed: { reason?: unknown } | undefined;
    try {
      parsed = answer.body === '' ? undefined : (JSON.parse(answer.body) as { reason?: unknown });
    } catch {
      parsed = undefined;
    }
    if (answer.status === 403 && parsed?.reason === 'ExpiredProviderToken') this.apnsJwt = undefined;
    const response = { ...(answer.headers['apns-id'] === undefined ? {} : { apnsId: answer.headers['apns-id'] }), ...(parsed === undefined ? {} : { body: parsed }) };
    if (answer.status === 200) return { ok: true, status: 200, response };
    return { ok: false, status: answer.status, reason: typeof parsed?.reason === 'string' ? parsed.reason : `HTTP ${String(answer.status)}`, response };
  }

  // history

  private record(request: PushRequest, result: PushResult): void {
    this.deps.db.prepare('INSERT INTO _push_history (at, platform, token, status, ok, reason) VALUES (?, ?, ?, ?, ?, ?)').run(this.deps.now().toISOString(), request.platform, maskTail(request.token), result.status, result.ok ? 1 : 0, result.reason ?? null);
    this.deps.db.prepare('DELETE FROM _push_history WHERE id NOT IN (SELECT id FROM _push_history ORDER BY id DESC LIMIT ?)').run(PUSH_HISTORY_KEEP);
  }

  history(): PushHistoryEntry[] {
    const rows = this.deps.db.prepare('SELECT id, at, platform, token, status, ok, reason FROM _push_history ORDER BY id DESC').all();
    return rows.map((row) => ({ id: Number(row.id), at: String(row.at), platform: row.platform as Platform, token: String(row.token), status: Number(row.status), ok: Number(row.ok) === 1, reason: row.reason === null ? null : String(row.reason) }));
  }
}
