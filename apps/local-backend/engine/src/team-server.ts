import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { join } from 'node:path';

import { match, tokenOf } from './admin.ts';
import { ApiKeys, looksLikeKey } from './api-keys.ts';
import type { AssetSources } from './assets.ts';
import type { Actor } from './audit.ts';
import { AuditLog, DEFAULT_AUDIT_DAYS } from './audit-log.ts';
import { dashboardReply, SECURITY_HEADERS } from './dashboard.ts';
import { isMutating, originOk, parseAdminTarget } from './hub.ts';
import { BackendRegistry, BACKEND_ID, type RegistryOptions } from './hub-backends.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import { atLeast, HUB_ROLE_TABLE, type AdminAccess, type ApiKeyScope, type Role } from './roles.ts';
import { SESSION_ID, TempSessions, type SessionLimits } from './sessions.ts';
import { buildTestSnapshot, SnapshotTooLargeError, testSnapshotReply } from './test-snapshot.ts';
import { closeServer, listenOn, readBody, sendReply, toCtx } from './server.ts';
import { refuseUpgrade } from './websocket.ts';
import { TeamAuth, type TeamAuthOptions } from './team-auth.ts';
import { teamRoutes, type TeamRoute, type TeamServices, type Who } from './team-routes.ts';
import { loadServerSecret } from './team-secret.ts';
import { TeamStore, type AccountRow } from './team-store.ts';
import { ProxyTrust } from './trust-proxy.ts';
import { APP_CSRF_COOKIE, APP_SESSION_COOKIE } from './constants.ts';
import { trustedPages } from './server.ts';
import { clearedCookie, CSRF_HEADER, csrfMatches, readCookie, SESSION_COOKIE, sessionCookie, Sessions, type Clock, type Session } from './web-auth.ts';

export const DEFAULT_TEAM_PORT = 8080;
const MAX_HUB_BODY = 8 * 1024 * 1024;
const GENERIC_LOGIN = 'The email or password is wrong.';
const AUDIT_PRUNE_MS = 6 * 60 * 60_000;

export interface TeamOptions {
  /** Where `server.sqlite` and `server-secret.json` live. */
  dataDir: string;
  /** Where the backends (one folder each) live. */
  backendsDir: string;
  port?: number;
  host?: string;
  /** Addresses or ranges of the reverse proxy (`private` for the loopback and private ranges). Off by default. */
  trustProxy?: readonly string[];
  auditDays?: number;
  assets?: AssetSources;
  clock?: Clock;
  auth?: TeamAuthOptions;
  idleMs?: number;
  /** Passed to every backend (tests). */
  registry?: Pick<RegistryOptions, 'start' | 'firstPort'>;
  /**
   * A separate origin for the public APIs, such as `https://api.example.com`. Requests for that host serve `/b/<id>/...`
   * and nothing else; the dashboard host serves no `/b`. Scripts a backend answers with then never run on the dashboard's
   * origin. Without it the public APIs share the dashboard's origin and are answered sandboxed and as downloads.
   */
  publicOrigin?: string;
  /**
   * Let backends import an API file from a URL that points at a private network (a LAN address, localhost, link-local).
   * Off by default, so the server cannot be used to reach the network it runs in (SSRF).
   */
  allowPrivateImportUrls?: boolean;
  /** Start the backends found in the backends directory (default true). */
  autostart?: boolean;
  /** Limits of the temporary CI sessions (`POST /b/<id>/__sessions`). */
  sessionLimits?: SessionLimits;
  /** How often expired sessions are swept (default one minute; tests lower it). */
  sessionSweepMs?: number;
  /** Requests per minute a key may make to `__definition` and `__sessions` (default 30). */
  controlRatePerMinute?: number;
}

export interface RunningTeam {
  readonly server: Server;
  readonly port: number;
  readonly store: TeamStore;
  readonly auth: TeamAuth;
  readonly keys: ApiKeys;
  readonly registry: BackendRegistry;
  readonly sessions: Sessions;
  readonly audit: AuditLog;
  /** The temporary CI sessions. */
  readonly tempSessions: TempSessions;
  /** Every `/__hub` route as `METHOD pattern`, for the role table check. */
  readonly hubRoutes: string[];
  stop(): Promise<void>;
}

type Principal = { kind: 'account'; account: AccountRow; sessionId: string; session: Session } | { kind: 'key'; actor: Actor; backendId: string; scope: NonNullable<AdminAccess['keyScope']> };

/** The team server: accounts and roles, API keys, an audit log, one port for the dashboard, the admin API and every backend's public API. */
export async function startTeam(options: TeamOptions): Promise<RunningTeam> {
  const clock = options.clock ?? Date.now;
  const store = new TeamStore(options.dataDir);
  const secret = loadServerSecret(options.dataDir);
  const auth = new TeamAuth(store, secret, { clock, ...(options.auth ?? {}) });
  const keys = new ApiKeys(store, clock);
  const audit = new AuditLog(store, { clock, retentionDays: options.auditDays ?? DEFAULT_AUDIT_DAYS });
  const sessions = new Sessions({ clock, maxSessions: 1000, ...(options.idleMs === undefined ? {} : { idleMs: options.idleMs }) });
  const trust = new ProxyTrust(options.trustProxy ?? []);
  const registry = new BackendRegistry(options.backendsDir, { ...(options.registry ?? {}), start: { ...(options.registry?.start ?? {}), importUrls: { allowPrivate: options.allowPrivateImportUrls === true } }, mounted: true, accessKey: (id, key) => keys.allows(key, id, 'public') });
  const publicOrigin = options.publicOrigin === undefined ? null : new URL(options.publicOrigin).origin;
  const publicHost = publicOrigin === null ? null : new URL(publicOrigin).host;
  const tempSessions = new TempSessions({
    dir: join(options.dataDir, 'sessions'),
    clock,
    ...(options.sessionLimits === undefined ? {} : { limits: options.sessionLimits }),
    ...(options.registry?.start === undefined ? {} : { start: options.registry.start }),
    ...(options.sessionSweepMs === undefined ? {} : { sweepEveryMs: options.sessionSweepMs }),
  });
  const controlHits = new Map<number, number[]>();
  const controlRate = options.controlRatePerMinute ?? 30;
  /** At most `controlRate` calls per minute and key to the control routes. Returns the seconds to wait, or 0. */
  const throttled = (keyId: number): number => {
    const now = clock();
    const recent = (controlHits.get(keyId) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= controlRate) {
      controlHits.set(keyId, recent);
      return Math.max(1, Math.ceil((60_000 - (now - (recent[0] ?? now))) / 1000));
    }
    recent.push(now);
    controlHits.set(keyId, recent);
    return 0;
  };
  const services: TeamServices = { store, auth, keys, registry, sessions, audit, now: clock, publicOrigin };

  const replaced = new Set(['GET /info', 'GET /backends', 'POST /backends', 'POST /backends/open', 'POST /restore', 'DELETE /backends/:id']);
  const own = teamRoutes(services);
  const hubRoutes: TeamRoute[] = [
    ...own,
    ...registry.routes.filter((route) => !replaced.has(`${route.method} ${route.pattern}`)).map((route): TeamRoute => ({ ...route, handler: (ctx, params) => route.handler(ctx, params) })),
  ];

  const reply = (res: ServerResponse, answer: Reply, head = false): void => sendReply(res, { ...answer, headers: { ...SECURITY_HEADERS, 'cache-control': 'no-store', ...answer.headers } }, head);
  const roleOn = (account: AccountRow, backendId: string | undefined): Role | undefined => (account.owner ? 'owner' : backendId === undefined ? undefined : store.membership(account.id, backendId)?.role);
  const actorOf = (account: AccountRow): Actor => ({ kind: 'account', id: String(account.id), label: account.email });

  /** The cookie of a request, as a live session of an enabled account. */
  function accountSession(req: IncomingMessage): { account: AccountRow; sessionId: string; session: Session } | undefined {
    const sessionId = readCookie(req.headers.cookie, SESSION_COOKIE);
    const session = sessions.get(sessionId);
    if (sessionId === undefined || session?.accountId === undefined) return undefined;
    const account = store.accountById(session.accountId);
    if (account === undefined || account.disabled) {
      sessions.destroy(sessionId);
      return undefined;
    }
    return { account, sessionId, session };
  }

  /**
   * Who is calling. An API key (`Authorization: Bearer tlb_...`) is a credential nothing sends by itself, so it needs no
   * CSRF token; a cookie is ambient, so a change also needs the CSRF header and a same-host `Origin`.
   */
  function authenticate(req: IncomingMessage, https: boolean): { principal: Principal } | { denied: Reply } {
    const given = tokenOf(req);
    const mutating = isMutating(req.method);
    if (given !== undefined) {
      const key = looksLikeKey(given) ? keys.verify(given) : undefined;
      if (key === undefined) return { denied: problemReply(401, { detail: 'That API key is wrong or was revoked.' }) };
      if (mutating && !originOk(req, https)) return { denied: problemReply(403, { detail: 'That request came from another origin.' }) };
      return { principal: { kind: 'key', actor: { kind: 'key', id: String(key.id), label: key.prefix }, backendId: key.backendId, scope: key.scope } };
    }
    const current = accountSession(req);
    if (current === undefined) return { denied: problemReply(401, { detail: 'Sign in first.' }) };
    if (mutating) {
      if (req.headers.origin === undefined || !originOk(req, https)) return { denied: problemReply(403, { detail: 'A change must come from this page (Origin check).' }) };
      if (!csrfMatches(current.session, req.headers[CSRF_HEADER])) return { denied: problemReply(403, { detail: 'The CSRF token is missing or wrong.' }) };
    }
    return { principal: { kind: 'account', ...current } };
  }

  // ---- sign-in

  async function sessionRoute(req: IncomingMessage, res: ServerResponse, https: boolean, ip: string): Promise<void> {
    const method = req.method ?? 'GET';
    const current = accountSession(req);
    const secure = https;
    if (method === 'GET') return reply(res, jsonReply(200, current === undefined ? { authenticated: false, login: 'password' } : { authenticated: true, csrf: current.session.csrf, login: 'password' }));
    if (!originOk(req, https)) return reply(res, problemReply(403, { detail: 'That request came from another origin.' }));
    if (method === 'DELETE') {
      if (current !== undefined) {
        if (!csrfMatches(current.session, req.headers[CSRF_HEADER])) return reply(res, problemReply(403, { detail: 'The CSRF token is missing or wrong.' }));
        sessions.destroy(current.sessionId);
      }
      return reply(res, jsonReply(200, { ok: true }, { 'set-cookie': clearedCookie({ secure }) }));
    }
    if (method !== 'POST') return reply(res, problemReply(405, { detail: 'Method not allowed.' }));
    const read = await readBody(req, 4096);
    if (!read.ok) return reply(res, problemReply(413, { title: 'Payload Too Large' }));
    const parsed = readJson(toCtx(req, read.text, https ? 'https' : 'http'));
    if (!parsed.ok) return reply(res, parsed.reply);
    const body = typeof parsed.value === 'object' && parsed.value !== null ? (parsed.value as { email?: unknown; password?: unknown; code?: unknown }) : {};
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || (body.code !== undefined && typeof body.code !== 'string')) {
      return reply(res, problemReply(400, { detail: 'Send { "email", "password" } and, when two-step sign-in is on, "code".' }));
    }
    const outcome = await auth.login({ email: body.email, password: body.password, ...(typeof body.code === 'string' ? { code: body.code } : {}) }, ip);
    const actor: Actor = { kind: 'account', id: '-', label: body.email.slice(0, 80).toLowerCase() };
    if (!outcome.ok) {
      if (outcome.reason === 'totp-required') return reply(res, problemReply(401, { detail: 'Enter the code from your authenticator app, or a recovery code.', extra: { totpRequired: true } }));
      if (outcome.reason === 'locked' || outcome.reason === 'rate') {
        return reply(res, problemReply(429, { detail: `Too many tries. Try again in ${String(Math.ceil(outcome.retryAfterSec / 60))} minute(s).`, headers: { 'retry-after': String(outcome.retryAfterSec) } }));
      }
      audit.record({ actor, backend: null, action: 'login.failed', target: outcome.reason, status: 401 });
      return reply(res, problemReply(401, { detail: outcome.reason === 'code' ? 'That code is wrong.' : GENERIC_LOGIN }));
    }
    sessions.destroy(current?.sessionId);
    const created = sessions.create(outcome.account.id);
    audit.record({ actor: actorOf(outcome.account), backend: null, action: outcome.usedRecoveryCode ? 'login.recovery-code' : 'login', target: '', status: 200 });
    return reply(res, jsonReply(200, { authenticated: true, csrf: created.session.csrf }, { 'set-cookie': sessionCookie(created.id, { secure }) }));
  }

  /** A person follows the link from an invitation and picks a password. */
  async function setupRoute(req: IncomingMessage, res: ServerResponse, https: boolean, ip: string): Promise<void> {
    if (req.method !== 'POST') return reply(res, problemReply(405, { detail: 'Method not allowed.' }));
    if (!originOk(req, https)) return reply(res, problemReply(403, { detail: 'That request came from another origin.' }));
    const limited = auth.ipAllowed(ip);
    if (!limited.ok) return reply(res, problemReply(429, { detail: 'Too many tries. Wait a minute.', headers: { 'retry-after': String(limited.retryAfterSec) } }));
    const read = await readBody(req, 4096);
    if (!read.ok) return reply(res, problemReply(413, { title: 'Payload Too Large' }));
    const parsed = readJson(toCtx(req, read.text, https ? 'https' : 'http'));
    if (!parsed.ok) return reply(res, parsed.reply);
    const body = typeof parsed.value === 'object' && parsed.value !== null ? (parsed.value as { token?: unknown; password?: unknown }) : {};
    if (typeof body.token !== 'string' || typeof body.password !== 'string' || body.token.length > 200) return reply(res, problemReply(400, { detail: 'Send { "token", "password" }.' }));
    let account: AccountRow | undefined;
    try {
      account = await auth.redeemSetup(body.token, body.password);
    } catch (error) {
      return reply(res, problemReply(400, { detail: error instanceof Error ? error.message : 'Bad password.' }));
    }
    if (account === undefined) return reply(res, problemReply(400, { detail: 'That link is wrong, used or expired. Ask for a new one.' }));
    // Whoever held a session of this account before the password was chosen is signed out.
    sessions.destroyAccount(account.id);
    audit.record({ actor: actorOf(account), backend: null, action: 'account.setup', target: '', status: 200 });
    return reply(res, jsonReply(200, { ok: true }));
  }

  // ---- the admin API of one backend

  async function adminRoute(req: IncomingMessage, res: ServerResponse, pathname: string, https: boolean): Promise<void> {
    const who = authenticate(req, https);
    if ('denied' in who) return reply(res, who.denied);
    const target = parseAdminTarget(req, pathname);
    if ('status' in target) return reply(res, target);
    const { id } = target;
    const principal = who.principal;
    let role: Role | undefined;
    let actor: Actor;
    let keyScope: AdminAccess['keyScope'];
    if (principal.kind === 'key') {
      // A key opens one backend only, and only what its scope allows.
      if (principal.backendId !== id) return reply(res, problemReply(403, { detail: 'That API key belongs to another backend.' }));
      role = 'admin';
      actor = principal.actor;
      keyScope = principal.scope;
    } else {
      role = roleOn(principal.account, id);
      actor = actorOf(principal.account);
    }
    // Not a member: the same answer as a backend that does not exist.
    if (role === undefined) return reply(res, problemReply(404, { detail: `No backend "${id}".` }));
    const handler = registry.admin(id);
    if (typeof handler !== 'function') return reply(res, handler);
    req.url = target.url;
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    res.setHeader('cache-control', 'no-store');
    const running = registry.running(id);
    const access: AdminAccess = {
      actor,
      role,
      ...(keyScope === undefined ? {} : { keyScope }),
      onWrite: (event) =>
        audit.record({
          actor,
          backend: id,
          action: event.route,
          target: Object.values(event.params).join('/') || '-',
          status: event.status,
          denied: event.denied,
          before: event.before,
          after: event.body,
          ...(event.uploadBytes === undefined ? {} : { uploadBytes: event.uploadBytes }),
        }),
    };
    if (running === undefined) return reply(res, problemReply(409, { detail: `${id} is stopped.` }));
    await running.handleAdmin(req, res, access);
  }

  // ---- the server's own routes (`/__hub`)

  async function hubRoute(req: IncomingMessage, res: ServerResponse, pathname: string, https: boolean): Promise<void> {
    const who = authenticate(req, https);
    if ('denied' in who) return reply(res, who.denied);
    if (who.principal.kind !== 'account') return reply(res, problemReply(403, { detail: 'An API key works on its backend\'s admin API only.' }));
    const { account, sessionId } = who.principal;
    const path = pathname.slice('/__hub'.length);
    let known = false;
    for (const route of hubRoutes) {
      const params = match(route.pattern, path);
      if (params === undefined) continue;
      known = true;
      if (route.method !== req.method) continue;
      const key = `${route.method} ${route.pattern}`;
      const need = HUB_ROLE_TABLE[key] ?? 'owner';
      const backendId = route.pattern.includes(':id') ? params.id : undefined;
      const role = roleOn(account, backendId);
      let allowed = false;
      if (need === 'any') allowed = true;
      else if (need === 'owner') allowed = account.owner;
      else allowed = role !== undefined && atLeast(role, need);
      const actor = actorOf(account);
      const writing = isMutating(req.method);
      let note: string | undefined;
      const record = (status: number, denied: boolean, body: unknown): void => {
        if (!writing) return;
        audit.record({ actor, backend: backendId ?? null, action: key, target: note ?? (Object.values(params).join('/') || '-'), status, denied, after: body });
      };
      if (!allowed) {
        const hidden = need !== 'owner' && need !== 'any' && role === undefined && !account.owner;
        record(hidden ? 404 : 403, true, undefined);
        return reply(res, hidden ? problemReply(404, { detail: `No backend "${backendId ?? ''}".` }) : problemReply(403, { detail: need === 'owner' ? 'Only the server owner can do that.' : `That needs the ${need} role on this backend.` }));
      }
      const streaming = route.streamsBody === true;
      const read = streaming ? { ok: true as const, text: '' } : await readBody(req, MAX_HUB_BODY);
      if (!read.ok) return reply(res, problemReply(413, { title: 'Payload Too Large' }));
      const ctx = toCtx(req, read.text, https ? 'https' : 'http');
      if (streaming) ctx.stream = req;
      const me: Who = { account, actor, sessionId, role, note: (text) => void (note = text) };
      try {
        const answer = await route.handler(ctx, params, me);
        record(answer.status, false, streaming ? undefined : readBodyJson(read.text));
        return reply(res, answer);
      } catch (error) {
        process.stderr.write(`hub error: ${error instanceof Error ? error.message : String(error)}\n`);
        record(500, false, undefined);
        return reply(res, problemReply(500, { detail: 'Unexpected server error.' }));
      }
    }
    return reply(res, known ? problemReply(405, { detail: 'Method not allowed.' }) : problemReply(404, { detail: 'Not found.' }));
  }

  // ---- control routes under /b/<id>: the test snapshot and the CI sessions

  /** A key of this backend with one of the scopes, from `Authorization: Bearer tlb_...`; else the answer to send. */
  function controlKey(req: IncomingMessage, id: string, scopes: readonly ApiKeyScope[]): { key: NonNullable<ReturnType<ApiKeys['verify']>> } | { denied: Reply } {
    const given = tokenOf(req);
    if (given === undefined) return { denied: problemReply(401, { detail: 'Send an API key: Authorization: Bearer tlb_...' }) };
    const key = looksLikeKey(given) ? keys.verify(given) : undefined;
    if (key === undefined) return { denied: problemReply(401, { detail: 'That API key is wrong or was revoked.' }) };
    if (key.backendId !== id) return { denied: problemReply(403, { detail: 'That API key belongs to another backend.' }) };
    if (!scopes.includes(key.scope)) return { denied: problemReply(403, { detail: `That needs an API key with the ${scopes.join(' or ')} scope.` }) };
    const wait = throttled(key.id);
    if (wait > 0) return { denied: problemReply(429, { detail: 'Too many requests with this key. Wait a moment.', headers: { 'retry-after': String(wait) } }) };
    return { key };
  }

  async function controlRoute(req: IncomingMessage, res: ServerResponse, id: string, sub: string, https: boolean): Promise<void> {
    const method = req.method ?? 'GET';
    const head = method === 'HEAD';
    if (sub === '/__definition') {
      if (method !== 'GET' && !head) return reply(res, problemReply(405, { detail: 'Use GET.', headers: { allow: 'GET, HEAD' } }));
      const who = controlKey(req, id, ['read-definition', 'admin']);
      if ('denied' in who) return reply(res, who.denied);
      const running = registry.running(id);
      if (running === undefined) return reply(res, problemReply(503, { detail: `${id} is not running.` }));
      const engine = running.engine;
      return reply(res, testSnapshotReply(() => buildTestSnapshot({ dir: engine.folder.dir, db: engine.store.db, collections: engine.definition.collections.map((collection) => collection.name) }), req.headers['if-none-match']), head);
    }
    const target = /^\/__sessions(?:\/([0-9a-f]{32}))?$/.exec(sub);
    if (target === null) return reply(res, problemReply(404, { detail: 'Not found.' }));
    const sessionId = target[1];
    const who = controlKey(req, id, ['sessions', 'admin']);
    if ('denied' in who) return reply(res, who.denied);
    const actor: Actor = { kind: 'key', id: String(who.key.id), label: who.key.prefix };
    if (sessionId === undefined) {
      if (method !== 'POST') return reply(res, problemReply(405, { detail: 'Use POST.', headers: { allow: 'POST' } }));
      const read = await readBody(req, 4096);
      if (!read.ok) return reply(res, problemReply(413, { title: 'Payload Too Large' }));
      let ttlMs: number | undefined;
      if (read.text.trim() !== '') {
        const parsed = readJson(toCtx(req, read.text, https ? 'https' : 'http'));
        if (!parsed.ok) return reply(res, parsed.reply);
        const ttl = typeof parsed.value === 'object' && parsed.value !== null ? (parsed.value as { ttlSeconds?: unknown }).ttlSeconds : undefined;
        if (ttl !== undefined) {
          if (typeof ttl !== 'number') return reply(res, problemReply(400, { detail: 'ttlSeconds must be a number.' }));
          ttlMs = ttl * 1000;
        }
      }
      const running = registry.running(id);
      if (running === undefined) return reply(res, problemReply(503, { detail: `${id} is not running.` }));
      const made = await tempSessions.create({ backendId: id, keyId: who.key.id, source: running, ...(ttlMs === undefined ? {} : { ttlMs }), accessKey: (key) => keys.allows(key, id, 'public') });
      if (!made.ok) {
        const status = made.reason === 'ttl' ? 400 : 429;
        audit.record({ actor, backend: id, action: 'session.create', target: '-', status, denied: true });
        return reply(res, made.reason === 'ttl' ? problemReply(400, { detail: made.detail }) : problemReply(429, { detail: made.detail, headers: { 'retry-after': String(made.retryAfterSec) } }));
      }
      const { session } = made;
      audit.record({ actor, backend: id, action: 'session.create', target: `session ${session.id.slice(0, 8)}`, status: 201, after: { ttlSeconds: Math.round((session.expiresAt - clock()) / 1000) } });
      const host = typeof req.headers.host === 'string' && /^[A-Za-z0-9.:[\]-]+$/.test(req.headers.host) ? req.headers.host : undefined;
      const origin = publicOrigin ?? (host === undefined ? '' : `${https ? 'https' : 'http'}://${host}`);
      return reply(res, jsonReply(201, { id: session.id, url: `${origin}/s/${session.id}/`, expiresAt: new Date(session.expiresAt).toISOString() }));
    }
    if (method !== 'DELETE') return reply(res, problemReply(405, { detail: 'Use DELETE.', headers: { allow: 'DELETE' } }));
    const gone = await tempSessions.delete(id, sessionId);
    audit.record({ actor, backend: id, action: 'session.delete', target: `session ${sessionId.slice(0, 8)}`, status: gone ? 200 : 404, denied: !gone });
    return reply(res, gone ? jsonReply(200, { ok: true }) : problemReply(404, { detail: 'No such session.' }));
  }

  /** A temporary session's public API under /s/<id>: the same sandbox as /b. */
  async function tempSessionRoute(req: IncomingMessage, res: ServerResponse, https: boolean): Promise<void> {
    const found = /^\/s\/([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(req.url ?? '/');
    const id = found?.[1] ?? '';
    const running = SESSION_ID.test(id) ? await tempSessions.get(id) : undefined;
    if (found === null || running === undefined) return reply(res, problemReply(404, { detail: 'No such session (it may have expired).' }));
    req.url = `${found[2] ?? '/'}${found[3] ?? ''}`;
    hardenPublic(res, (found[2] ?? '/').startsWith('/__docs'), running.engine.definition.auth.mode === 'bearer' ? undefined : `/s/${id}/`);
    running.handlePublic(req, res, { scheme: https ? 'https' : 'http', ip: trust.client(req).ip });
  }

  // ---- a backend's public API under /b/<id>

  function publicRoute(req: IncomingMessage, res: ServerResponse, https: boolean): void {
    const raw = req.url ?? '/';
    const found = /^\/b\/([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(raw);
    const id = found?.[1] ?? '';
    if (found === null || !BACKEND_ID.test(id) || !registry.listedIds().includes(id)) return reply(res, problemReply(404, { detail: 'No such backend.' }));
    const running = registry.running(id);
    if (running === undefined) return reply(res, problemReply(503, { detail: `${id} is not running.` }));
    const sub = found[2] ?? '/';
    if (sub === '/__definition' || sub === '/__sessions' || sub.startsWith('/__sessions/')) {
      void controlRoute(req, res, id, sub, https).catch((error: unknown) => {
        if (error instanceof SnapshotTooLargeError) return reply(res, problemReply(413, { detail: error.message }));
        process.stderr.write(`control route error: ${error instanceof Error ? error.message : String(error)}\n`);
        return reply(res, problemReply(500, { detail: 'Unexpected server error.' }));
      });
      return;
    }
    // The engine sees the path without the prefix, like on its own port.
    req.url = `${found[2] ?? '/'}${found[3] ?? ''}`;
    hardenPublic(res, (found[2] ?? '/').startsWith('/__docs'), running.engine.definition.auth.mode === 'bearer' ? undefined : `/b/${id}/`);
    running.handlePublic(req, res, { scheme: https ? 'https' : 'http', ip: trust.client(req).ip });
  }

  const server = createServer((req, res) => {
    void (async (): Promise<void> => {
      const client = trust.client(req);
      const pathname = new URL(req.url ?? '/', 'http://local').pathname;
      if (pathname === '/__health') return reply(res, jsonReply(200, { ok: true, service: 'tempo-local-backend', mode: 'team' }), req.method === 'HEAD');
      const onPublicHost = publicHost !== null && String(req.headers.host ?? '').toLowerCase() === publicHost.toLowerCase();
      const isSessionPath = pathname.startsWith('/s/');
      const isPublicPath = pathname === '/b' || pathname.startsWith('/b/') || isSessionPath;
      if (publicHost !== null && isPublicPath !== onPublicHost) return reply(res, problemReply(404, { detail: isPublicPath ? `The public APIs are at ${publicOrigin ?? ''}.` : 'Not found.' }));
      if (isSessionPath) return tempSessionRoute(req, res, client.https);
      if (isPublicPath) return publicRoute(req, res, client.https);
      if (pathname === '/__session') return sessionRoute(req, res, client.https, client.ip);
      if (pathname === '/__setup') return setupRoute(req, res, client.https, client.ip);
      if (pathname.startsWith('/__hub/')) return hubRoute(req, res, pathname, client.https);
      if (pathname.startsWith('/__admin/')) return adminRoute(req, res, pathname, client.https);
      if (req.method === 'GET' || req.method === 'HEAD') {
        const answer = pathname.startsWith('/__') ? problemReply(404, { detail: 'Not found.' }) : dashboardReply(pathname, options.assets);
        const cache = answer.headers['cache-control'];
        return sendReply(res, { ...answer, headers: { ...SECURITY_HEADERS, ...(cache === undefined ? { 'cache-control': 'no-store' } : {}), ...answer.headers } }, req.method === 'HEAD');
      }
      return reply(res, problemReply(405, { detail: 'Method not allowed.' }));
    })();
  });

  // A WebSocket upgrade for a backend's public API (`/b/<id>` or `/s/<id>`): the same routing as a request, the same sandbox.
  // Upgraded sockets leave the HTTP server's own list but still keep `server.close()` waiting, so they are tracked here.
  const upgraded = new Set<Duplex>();
  async function upgradeRoute(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    socket.on('error', () => undefined);
    upgraded.add(socket);
    socket.once('close', () => upgraded.delete(socket));
    const client = trust.client(req);
    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    const onPublicHost = publicHost !== null && String(req.headers.host ?? '').toLowerCase() === publicHost.toLowerCase();
    const isSessionPath = pathname.startsWith('/s/');
    const isPublicPath = pathname === '/b' || pathname.startsWith('/b/') || isSessionPath;
    if (!isPublicPath || (publicHost !== null && isPublicPath !== onPublicHost)) return refuseUpgrade(socket, 404, 'Not found.');
    const raw = req.url ?? '/';
    let running: ReturnType<typeof registry.running>;
    let rest: string;
    if (isSessionPath) {
      const found = /^\/s\/([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(raw);
      const id = found?.[1] ?? '';
      running = SESSION_ID.test(id) ? await tempSessions.get(id) : undefined;
      if (found === null || running === undefined) return refuseUpgrade(socket, 404, 'No such session (it may have expired).');
      rest = `${found[2] ?? '/'}${found[3] ?? ''}`;
    } else {
      const found = /^\/b\/([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(raw);
      const id = found?.[1] ?? '';
      if (found === null || !BACKEND_ID.test(id) || !registry.listedIds().includes(id)) return refuseUpgrade(socket, 404, 'No such backend.');
      running = registry.running(id);
      if (running === undefined) return refuseUpgrade(socket, 503, `${id} is not running.`);
      rest = `${found[2] ?? '/'}${found[3] ?? ''}`;
    }
    // The engine sees the path without the prefix, like on its own port. The control routes (`/__...`) are not WebSockets.
    if ((rest.split('?')[0] ?? '').split('/').find((part) => part !== '')?.startsWith('__') === true) return refuseUpgrade(socket, 404, 'Not found.');
    req.url = rest;
    running.handleUpgrade(req, socket, head, { scheme: client.https ? 'https' : 'http', ip: client.ip });
  }
  server.on('upgrade', (req, socket, head) => {
    void upgradeRoute(req, socket, head).catch(() => socket.destroy());
  });

  let port: number;
  try {
    port = await listenOn(server, options.port ?? DEFAULT_TEAM_PORT, options.host ?? '0.0.0.0');
  } catch (error) {
    store.close();
    throw error;
  }
  if (options.autostart !== false) await registry.startAll();
  const pruneTimer = setInterval(() => audit.prune(), AUDIT_PRUNE_MS);
  pruneTimer.unref();

  let stopping: Promise<void> | undefined;
  return {
    server,
    port,
    store,
    auth,
    keys,
    registry,
    sessions,
    audit,
    tempSessions,
    hubRoutes: hubRoutes.map((route) => `${route.method} ${route.pattern}`),
    stop() {
      stopping ??= (async (): Promise<void> => {
        clearInterval(pruneTimer);
        for (const socket of upgraded) socket.destroy();
        await closeServer(server);
        await tempSessions.stopAll();
        await registry.stopAll();
        store.close();
      })();
      return stopping;
    },
  };
}

/** Types a browser runs or renders as a page; a backend's answer with one of these is sent as a download. */
const ACTIVE_TYPES = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)\b/i;

/**
 * What a backend says in `/b/<id>` answers is untrusted by the dashboard that shares the origin: an endpoint, handler or
 * media file can return HTML or script. Every answer is sandboxed (`Content-Security-Policy: sandbox`, so the page has
 * an opaque origin and no cookies or storage of the dashboard), sniffing is off, pages and SVG are downloads, and a
 * backend can never set a cookie. The engine's own Swagger UI keeps its policy (it needs its scripts) but no cookie.
 */
/** A cookie a backend may set on the team server: only the app session cookie, scoped to `/b/<id>/`, with no `Domain`, never the dashboard's. */
export function vetAppCookie(cookie: string, path: string): string | undefined {
  const parts = cookie.split(';').map((part) => part.trim());
  const name = parts[0]?.slice(0, parts[0].indexOf('=')) ?? '';
  if (name !== APP_SESSION_COOKIE && name !== APP_CSRF_COOKIE) return undefined;
  const attributes = parts.slice(1).map((part) => part.toLowerCase());
  if (attributes.some((part) => part.startsWith('domain='))) return undefined;
  if (!attributes.includes(`path=${path.toLowerCase()}`)) return undefined;
  return cookie;
}

function hardenPublic(res: ServerResponse, engineOwned: boolean, cookiePath?: string): void {
  const write = res.writeHead.bind(res) as (status: number, ...rest: unknown[]) => ServerResponse;
  res.writeHead = ((status: number, ...rest: unknown[]) => {
    const given = rest.find((item) => typeof item === 'object' && item !== null && !Array.isArray(item)) as Record<string, string | number | string[]> | undefined;
    const headers: Record<string, string | number | string[]> = {};
    for (const [name, value] of Object.entries({ ...res.getHeaders(), ...(given ?? {}) })) if (value !== undefined) headers[name.toLowerCase()] = value as string | number | string[];
    // A backend can never set a cookie, unless its auth mode is cookie: then only its own session cookie, scoped to its path.
    const offered = headers['set-cookie'];
    delete headers['set-cookie'];
    delete headers['set-cookie2'];
    if (cookiePath !== undefined && offered !== undefined) {
      const kept = (Array.isArray(offered) ? offered : [String(offered)]).map((cookie) => vetAppCookie(cookie, cookiePath)).filter((cookie): cookie is string => cookie !== undefined);
      if (kept.length > 0) headers['set-cookie'] = kept;
    }
    headers['x-content-type-options'] = 'nosniff';
    headers['cross-origin-resource-policy'] = 'same-site';
    headers['referrer-policy'] = 'no-referrer';
    if (!engineOwned && !trustedPages.has(res)) {
      headers['content-security-policy'] = "sandbox; default-src 'none'";
      if (ACTIVE_TYPES.test(String(headers['content-type'] ?? ''))) headers['content-disposition'] = 'attachment';
    }
    for (const name of res.getHeaderNames()) res.removeHeader(name);
    const text = rest.find((item) => typeof item === 'string');
    return text === undefined ? write(status, headers) : write(status, text, headers);
  }) as typeof res.writeHead;
}

function readBodyJson(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
