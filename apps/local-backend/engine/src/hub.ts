import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { loopbackHost, match, sameToken, tokenOf, type AdminRoute } from './admin.ts';
import type { AssetSources } from './assets.ts';
import { dashboardReply, SECURITY_HEADERS } from './dashboard.ts';
import { jsonReply, problemReply, readJson, type Reply } from './http.ts';
import { readBody, sendReply, toCtx } from './server.ts';
import { clearedCookie, CSRF_HEADER, csrfMatches, LoginCodes, readCookie, SESSION_COOKIE, sessionCookie, Sessions, type Session } from './web-auth.ts';

const MAX_HUB_BODY = 8 * 1024 * 1024;
const WRONG_CODE = 'That code is wrong, used or expired. Restart the server for a new one.';

/** The backends the hub serves. The registry (`hub-backends.ts`) is the real one; tests and the empty start use others. */
export interface BackendHost {
  /** Routes under `/__hub`. A route that streams its body sets `streamsBody` so the hub does not read it up front. */
  routes: (AdminRoute & { streamsBody?: boolean })[];
  /** The admin handler of a running backend, or the answer to give when there is none. */
  admin(id: string): ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | Reply;
}

export const noBackends: BackendHost = {
  routes: [
    { method: 'GET', pattern: '/backends', handler: () => jsonReply(200, []) },
    { method: 'GET', pattern: '/unlisted', handler: () => jsonReply(200, []) },
  ],
  admin: (id) => problemReply(404, { detail: `No backend "${id}".` }),
};

export interface HubOptions {
  host?: BackendHost;
  /** Dashboard file sources (tests pass their own; the default reads the package or the single executable). */
  assets?: AssetSources;
  codes?: LoginCodes;
  sessions?: Sessions;
  /** Per-launch admin token. Both it and a session are accepted on admin routes; it is never sent to a browser. */
  token?: string;
  /** Serve over TLS in front (Z2): cookies get `Secure`. A direct HTTP listener on 127.0.0.1 leaves this off. */
  secureCookies?: boolean;
}

export interface Hub {
  server: Server;
  codes: LoginCodes;
  sessions: Sessions;
  token: string;
}

/**
 * `/__admin/b/<id>/<rest>` -> the backend's own `/__admin/<rest>`. The raw path is used: `new URL` would quietly
 * resolve `..`, and nothing here may climb out of the backend. Returns the backend id and the rewritten URL, or the
 * answer to give.
 */
export function parseAdminTarget(req: IncomingMessage, pathname: string): { id: string; url: string } | Reply {
  const rawPath = (req.url ?? '').split('?', 1)[0] ?? '';
  if (/(^|\/)\.\.?(\/|$)|%2e|%2f|%5c|%00|\\|\/\//i.test(rawPath.slice('/__admin/b/'.length))) return problemReply(400, { detail: 'That path is not allowed.' });
  const rest = /^\/__admin\/b\/([^/]+)(\/.*)$/.exec(rawPath);
  if (rest === null || pathname !== rawPath) return problemReply(404, { detail: 'Not found.' });
  let id: string;
  try {
    id = decodeURIComponent(rest[1] ?? '');
  } catch {
    return problemReply(400, { detail: 'Bad backend name.' });
  }
  const query = (req.url ?? '').includes('?') ? `?${(req.url ?? '').split('?').slice(1).join('?')}` : '';
  return { id, url: `/__admin${rest[2] ?? ''}${query}` };
}

/** Origins a page on the same host may send: `http://<host>` (or https) with the `Host` the request used. */
export function originOk(req: IncomingMessage, secure: boolean): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  const encrypted = secure || (req.socket as { encrypted?: boolean }).encrypted === true;
  return origin === `${encrypted ? 'https' : 'http'}://${String(req.headers.host ?? '')}` && req.headers['sec-fetch-site'] !== 'cross-site';
}

export const isMutating = (method: string | undefined): boolean => !['GET', 'HEAD', 'OPTIONS'].includes(method ?? 'GET');

/**
 * The web listener (`127.0.0.1` only): the dashboard, the sign-in, and the admin API of every backend.
 *
 * - Pages and files at `/` and `/login`: no sign-in needed (they hold no data).
 * - `/__session`: exchange the one-time code for a session; read or end it.
 * - `/__hub/...` and `/__admin/b/<backend>/...`: need a session or the admin token. A session (an ambient
 *   credential) also needs the CSRF header on every mutating request and a same-host `Origin`; the token does not
 *   (nothing sends it by itself).
 * - A `Host` that is not loopback is refused first, so DNS rebinding does not reach any of it.
 */
export function createHub(options: HubOptions = {}): Hub {
  const host = options.host ?? noBackends;
  const codes = options.codes ?? new LoginCodes();
  const sessions = options.sessions ?? new Sessions();
  const token = options.token ?? randomBytes(32).toString('hex');
  const secure = options.secureCookies ?? false;

  const reply = (res: ServerResponse, answer: Reply, head = false): void =>
    sendReply(res, { ...answer, headers: { ...SECURITY_HEADERS, 'cache-control': 'no-store', ...answer.headers } }, head);

  const sessionOf = (req: IncomingMessage): { id: string; session: Session } | undefined => {
    const id = readCookie(req.headers.cookie, SESSION_COOKIE);
    const session = sessions.get(id);
    return id === undefined || session === undefined ? undefined : { id, session };
  };

  async function session(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const current = sessionOf(req);
    if (method === 'GET') {
      return reply(res, jsonReply(200, current === undefined ? { authenticated: false, login: 'code' } : { authenticated: true, csrf: current.session.csrf, login: 'code' }));
    }
    if (!originOk(req, secure)) return reply(res, problemReply(403, { detail: 'That request came from another origin.' }));
    if (method === 'DELETE') {
      if (current === undefined) return reply(res, jsonReply(200, { ok: true }, { 'set-cookie': clearedCookie({ secure }) }));
      if (!csrfMatches(current.session, req.headers[CSRF_HEADER])) return reply(res, problemReply(403, { detail: 'The CSRF token is missing or wrong.' }));
      sessions.destroy(current.id);
      return reply(res, jsonReply(200, { ok: true }, { 'set-cookie': clearedCookie({ secure }) }));
    }
    if (method !== 'POST') return reply(res, problemReply(405, { detail: 'Method not allowed.' }));
    const read = await readBody(req, 4096);
    if (!read.ok) return reply(res, problemReply(413, { title: 'Payload Too Large' }));
    const parsed = readJson(toCtx(req, read.text));
    if (!parsed.ok) return reply(res, parsed.reply);
    const code = typeof parsed.value === 'object' && parsed.value !== null ? (parsed.value as { code?: unknown }).code : undefined;
    if (typeof code !== 'string' || code.length > 64) return reply(res, problemReply(400, { detail: 'Send { "code": "<login code>" }.' }));
    const outcome = codes.redeem(code);
    if (!outcome.ok) {
      if (outcome.reason === 'rate') return reply(res, problemReply(429, { detail: `Too many wrong codes. Try again in ${String(outcome.retryAfterSec)} seconds.`, headers: { 'retry-after': String(outcome.retryAfterSec) } }));
      return reply(res, problemReply(401, { detail: WRONG_CODE }));
    }
    sessions.destroy(current?.id);
    const created = sessions.create();
    return reply(res, jsonReply(200, { authenticated: true, csrf: created.session.csrf }, { 'set-cookie': sessionCookie(created.id, { secure }) }));
  }

  /** Who is calling an admin route, and whether a cookie caller passed the CSRF and Origin checks. */
  function authorize(req: IncomingMessage): Reply | undefined {
    const given = tokenOf(req);
    const mutating = isMutating(req.method);
    if (given !== undefined && sameToken(given, token)) return mutating && !originOk(req, secure) ? problemReply(403, { detail: 'That request came from another origin.' }) : undefined;
    const current = sessionOf(req);
    if (current === undefined) return problemReply(401, { detail: 'Sign in with the login code first.' });
    if (mutating) {
      if (req.headers.origin === undefined || !originOk(req, secure)) return problemReply(403, { detail: 'A change must come from this page (Origin check).' });
      if (!csrfMatches(current.session, req.headers[CSRF_HEADER])) return problemReply(403, { detail: 'The CSRF token is missing or wrong.' });
    }
    return undefined;
  }

  async function adminRoute(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const denied = authorize(req);
    if (denied !== undefined) return reply(res, denied);
    const parsed = parseAdminTarget(req, pathname);
    if ('status' in parsed) return reply(res, parsed);
    const { id } = parsed;
    const target = host.admin(id);
    if (typeof target !== 'function') return reply(res, target);
    req.url = parsed.url;
    // The backend's SSE and file answers write to `res` themselves; give them the same hardening headers first.
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    res.setHeader('cache-control', 'no-store');
    await target(req, res);
  }

  async function hubRoute(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const denied = authorize(req);
    if (denied !== undefined) return reply(res, denied);
    const path = pathname.slice('/__hub'.length);
    let known = false;
    for (const route of host.routes) {
      const params = match(route.pattern, path);
      if (params === undefined) continue;
      known = true;
      if (route.method !== req.method) continue;
      const streaming = route.streamsBody === true;
      const read = streaming ? { ok: true as const, text: '' } : await readBody(req, MAX_HUB_BODY);
      if (!read.ok) return reply(res, problemReply(413, { title: 'Payload Too Large' }));
      const ctx = toCtx(req, read.text);
      if (streaming) ctx.stream = req;
      try {
        return reply(res, await route.handler(ctx, params));
      } catch (error) {
        process.stderr.write(`hub error: ${error instanceof Error ? error.message : String(error)}\n`);
        return reply(res, problemReply(500, { detail: 'Unexpected server error.' }));
      }
    }
    return reply(res, known ? problemReply(405, { detail: 'Method not allowed.' }) : problemReply(404, { detail: 'Not found.' }));
  }

  const server = createServer((req, res) => {
    void (async (): Promise<void> => {
      if (!loopbackHost(req)) return reply(res, problemReply(403, { detail: 'The dashboard answers on 127.0.0.1 only.' }));
      const pathname = new URL(req.url ?? '/', 'http://local').pathname;
      if (pathname === '/__session') return session(req, res);
      if (pathname.startsWith('/__hub/')) return hubRoute(req, res, pathname);
      if (pathname.startsWith('/__admin/')) return adminRoute(req, res, pathname);
      if (req.method === 'GET' || req.method === 'HEAD') {
        const answer = pathname.startsWith('/__') ? problemReply(404, { detail: 'Not found.' }) : dashboardReply(pathname, options.assets);
        const cache = answer.headers['cache-control'];
        return sendReply(res, { ...answer, headers: { ...SECURITY_HEADERS, ...(cache === undefined ? { 'cache-control': 'no-store' } : {}), ...answer.headers } }, req.method === 'HEAD');
      }
      return reply(res, problemReply(405, { detail: 'Method not allowed.' }));
    })();
  });
  return { server, codes, sessions, token };
}
