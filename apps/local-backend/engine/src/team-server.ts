import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { match, tokenOf } from './admin.ts';
import { ApiKeys, looksLikeKey } from './api-keys.ts';
import type { AssetSources } from './assets.ts';
import type { Actor } from './audit.ts';
import { AuditLog, DEFAULT_AUDIT_DAYS } from './audit-log.ts';
import { dashboardReply, SECURITY_HEADERS } from './dashboard.ts';
import { isMutating, originOk, parseAdminTarget } from './hub.ts';
import { BackendRegistry, BACKEND_ID, type RegistryOptions } from './hub-backends.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import { atLeast, HUB_ROLE_TABLE, type AdminAccess, type Role } from './roles.ts';
import { closeServer, listenOn, readBody, sendReply, toCtx } from './server.ts';
import { TeamAuth, type TeamAuthOptions } from './team-auth.ts';
import { teamRoutes, type TeamRoute, type TeamServices, type Who } from './team-routes.ts';
import { loadServerSecret } from './team-secret.ts';
import { TeamStore, type AccountRow } from './team-store.ts';
import { ProxyTrust } from './trust-proxy.ts';
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
  /** Start the backends found in the backends directory (default true). */
  autostart?: boolean;
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
  const registry = new BackendRegistry(options.backendsDir, { ...(options.registry ?? {}), mounted: true, accessKey: (id, key) => keys.allows(key, id, 'public') });
  const services: TeamServices = { store, auth, keys, registry, sessions, audit, now: clock };

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

  // ---- a backend's public API under /b/<id>

  function publicRoute(req: IncomingMessage, res: ServerResponse, https: boolean): void {
    const raw = req.url ?? '/';
    const found = /^\/b\/([^/?]+)(\/[^?]*)?(\?.*)?$/.exec(raw);
    const id = found?.[1] ?? '';
    if (found === null || !BACKEND_ID.test(id) || !registry.listedIds().includes(id)) return reply(res, problemReply(404, { detail: 'No such backend.' }));
    const running = registry.running(id);
    if (running === undefined) return reply(res, problemReply(503, { detail: `${id} is not running.` }));
    // The engine sees the path without the prefix, like on its own port.
    req.url = `${found[2] ?? '/'}${found[3] ?? ''}`;
    running.handlePublic(req, res, { scheme: https ? 'https' : 'http' });
  }

  const server = createServer((req, res) => {
    void (async (): Promise<void> => {
      const client = trust.client(req);
      const pathname = new URL(req.url ?? '/', 'http://local').pathname;
      if (pathname === '/__health') return reply(res, jsonReply(200, { ok: true, service: 'tempo-local-backend', mode: 'team' }), req.method === 'HEAD');
      if (pathname === '/b' || pathname.startsWith('/b/')) return publicRoute(req, res, client.https);
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
    hubRoutes: hubRoutes.map((route) => `${route.method} ${route.pattern}`),
    stop() {
      stopping ??= (async (): Promise<void> => {
        clearInterval(pruneTimer);
        await closeServer(server);
        await registry.stopAll();
        store.close();
      })();
      return stopping;
    },
  };
}

function readBodyJson(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
