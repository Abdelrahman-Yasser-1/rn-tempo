import { readFileSync, existsSync } from 'node:fs';
import { closeSync, constants, createReadStream, openSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join, isAbsolute, resolve } from 'node:path';
import { pipeline, Readable, type Duplex } from 'node:stream';

import { CERT_FILE, KEY_FILE } from '@rn-tempo/dev-api';

import type { Engine } from './engine.ts';
import { problemReply, type Reply, type RequestCtx } from './http.ts';
import { paceRequest, ThrottleStream } from './network.ts';
import { refuseUpgrade } from './websocket.ts';

/** The most a request body may hold. Uploads (Y2) will stream past this on their own routes. */
export const MAX_BODY_BYTES = 1024 * 1024;

/** The certificate folder: `certsDir` of the definition (relative to the backend folder), else `.data/certs`. */
export function certsDirOf(engine: Engine): string {
  const configured = engine.definition.certsDir;
  if (configured === undefined) return join(engine.folder.dataDir, 'certs');
  return isAbsolute(configured) ? configured : resolve(engine.folder.dir, configured);
}

export function readTls(dir: string): { cert: Buffer; key: Buffer } | undefined {
  const cert = join(dir, CERT_FILE);
  const key = join(dir, KEY_FILE);
  return existsSync(cert) && existsSync(key) ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined;
}

/** Reads the body, refusing more than `max` bytes. */
export function readBody(req: IncomingMessage, max = MAX_BODY_BYTES): Promise<{ ok: true; text: string } | { ok: false }> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) over = true;
      else chunks.push(chunk);
    });
    req.on('end', () => resolveBody(over ? { ok: false } : { ok: true, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => resolveBody({ ok: false }));
  });
}

/**
 * The request as the engine sees it. `scheme` is the one the client used when a trusted proxy terminated TLS in front
 * (the team server decides that); otherwise it follows the socket.
 */
export function toCtx(req: IncomingMessage, bodyText: string, scheme?: 'http' | 'https', ip?: string): RequestCtx {
  const url = req.url ?? '/';
  const parsed = new URL(url, 'http://local');
  const encrypted = scheme === undefined ? (req.socket as { encrypted?: boolean }).encrypted === true : scheme === 'https';
  const host = typeof req.headers.host === 'string' && /^[A-Za-z0-9.:[\]-]+$/.test(req.headers.host) ? req.headers.host : undefined;
  return {
    method: req.method ?? 'GET',
    path: parsed.pathname,
    url,
    query: parsed.searchParams,
    headers: req.headers,
    bodyText,
    ip: ip ?? req.socket.remoteAddress ?? 'unknown',
    ...(host === undefined ? {} : { origin: `${encrypted ? 'https' : 'http'}://${host}` }),
  };
}

export function sendReply(res: ServerResponse, reply: Reply, headOnly = false): void {
  if (reply.abandoned === true || res.destroyed) {
    reply.stream?.destroy();
    return;
  }
  if (reply.close === true) {
    // The `timeout` preset: no status line, no body, just a closed connection.
    res.destroy();
    return;
  }
  let fd: number | undefined;
  if (reply.file !== undefined && !headOnly) {
    try {
      fd = openSync(reply.file.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      sendReply(res, problemReply(404, { detail: 'The file is missing.' }));
      return;
    }
  }
  const payload = reply.raw !== undefined ? reply.raw : reply.body === undefined ? undefined : JSON.stringify(reply.body);
  try {
    res.writeHead(reply.status, {
      'x-content-type-options': 'nosniff',
      ...reply.headers,
      ...(payload === undefined ? {} : { 'content-length': String(Buffer.byteLength(payload)) }),
    });
  } catch {
    // A header name or value the engine cannot send (for example a line break in a static header).
    if (fd !== undefined) closeSync(fd);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Invalid response headers in the endpoint definition.');
    return;
  }
  // Throttling sends the body through a stream that releases it at the set rate; it stops when the client does.
  if (reply.file !== undefined && fd !== undefined) {
    // The path comes from a validated media id. `O_NOFOLLOW` keeps a planted link from being read.
    const source = createReadStream(reply.file.path, { fd, start: reply.file.start, end: reply.file.end });
    streamOut(source, res, reply.downloadKbps);
    return;
  }
  if (reply.stream !== undefined) {
    if (headOnly) reply.stream.destroy();
    else streamOut(reply.stream, res, reply.downloadKbps);
    if (headOnly) res.end();
    return;
  }
  if (payload !== undefined && !headOnly && reply.downloadKbps !== undefined) {
    streamOut(Readable.from([Buffer.from(payload)]), res, reply.downloadKbps);
    return;
  }
  res.end(headOnly ? undefined : payload);
}

/** Pipes a body to the client, at `kbps` when that is set. Everything is torn down when either side closes. */
function streamOut(source: Readable, res: ServerResponse, kbps: number | undefined): void {
  if (kbps === undefined) pipeline(source, res, () => undefined);
  else pipeline(source, new ThrottleStream(kbps), res, () => undefined);
}

export interface PublicListenOptions {
  port: number;
  host?: string;
  tls?: { cert: Buffer; key: Buffer };
}

export const ACCESS_KEY_HEADER = 'x-tempo-access-key';

export interface PublicOptions {
  /**
   * Checks the `x-tempo-access-key` header of a backend with `publicAccess: "key"`. Only the team server provides one;
   * without it such a backend refuses every request (it never falls back to open).
   */
  accessKey?: (key: string | undefined) => boolean;
}

export type PublicHandler = (req: IncomingMessage, res: ServerResponse, meta?: { scheme?: 'http' | 'https'; ip?: string }) => void;

/** The public API of one backend as a request handler: the API, `/__health` and the docs. There is no admin route. */
export function createPublicHandler(engine: Engine, extra: (ctx: RequestCtx, res: ServerResponse) => boolean, options: PublicOptions = {}): PublicHandler {
  return (req, res, meta) => {
    void (async (): Promise<void> => {
      // An upload streams its own body; every other request is read up front, with a small limit.
      const path = new URL(req.url ?? '/', 'http://local').pathname;
      if (engine.definition.publicAccess === 'key' && path !== '/__health') {
        if (options.accessKey === undefined) {
          sendReply(res, problemReply(401, { detail: 'This backend needs an access key, which only the team server manages.' }));
          return;
        }
        const given = req.headers[ACCESS_KEY_HEADER];
        if (!options.accessKey(typeof given === 'string' ? given : undefined)) {
          sendReply(res, problemReply(401, { detail: `This API needs a valid access key in the ${ACCESS_KEY_HEADER} header.` }));
          return;
        }
      }
      const method = req.method === 'HEAD' ? 'GET' : (req.method ?? 'GET');
      const streaming = engine.streamsBody(method, path);
      // Delay and throttle are worked out first, from the headers, so a slow upload is slowed while it is read.
      const plan = engine.planRequest(method, path, req.headers);
      const gone = new AbortController();
      res.once('close', () => gone.abort());
      if (!streaming && plan.network.uploadKbps !== undefined) paceRequest(req, plan.network.uploadKbps);
      const body = streaming ? { ok: true as const, text: '' } : await readBody(req);
      if (!body.ok) {
        sendReply(res, problemReply(413, { title: 'Payload Too Large', detail: `Bodies are limited to ${MAX_BODY_BYTES} bytes.` }));
        return;
      }
      const head = req.method === 'HEAD';
      const ctx = toCtx(req, body.text, meta?.scheme, meta?.ip);
      ctx.plan = plan;
      ctx.signal = gone.signal;
      if (streaming) ctx.stream = req;
      if (head) ctx.method = 'GET';
      if (ctx.path === '/__health') {
        sendReply(res, { status: 200, headers: { 'content-type': 'application/json' }, body: { ok: true, service: 'tempo-local-backend', name: engine.definition.name, startedAt: engine.startedAt } }, head);
        return;
      }
      if ((ctx.path.split('/').find((part) => part !== '') ?? '').startsWith('__')) {
        if (extra(ctx, res)) return;
        sendReply(res, problemReply(404, { detail: 'Not found.' }), head);
        return;
      }
      sendReply(res, await engine.handle(ctx), head);
    })();
  };
}

export type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer, meta?: { scheme?: 'http' | 'https'; ip?: string }) => void;

/** The HTTP Upgrade requests of a backend (WebSocket endpoints): the access key is checked first, like on any public request. */
export function createUpgradeHandler(engine: Engine, options: PublicOptions = {}): UpgradeHandler {
  return (req, socket, head, meta) => {
    if (engine.definition.publicAccess === 'key') {
      const given = req.headers[ACCESS_KEY_HEADER];
      if (options.accessKey === undefined || !options.accessKey(typeof given === 'string' ? given : undefined)) {
        socket.on('error', () => undefined);
        return refuseUpgrade(socket, 401, `This API needs a valid access key in the ${ACCESS_KEY_HEADER} header.`);
      }
    }
    engine.handleUpgrade(req, socket, head, meta);
  };
}

/** The public listener (one port per backend: desktop and local use). */
export function createPublicServer(
  engine: Engine,
  extra: (ctx: RequestCtx, res: ServerResponse) => boolean,
  tls: PublicListenOptions['tls'],
  options: PublicOptions = {},
): Server {
  const handler = createPublicHandler(engine, extra, options);
  const server = tls === undefined ? createHttpServer((req, res) => handler(req, res)) : createHttpsServer(tls, (req, res) => handler(req, res));
  const upgrade = createUpgradeHandler(engine, options);
  server.on('upgrade', (req, socket, head) => upgrade(req, socket, head));
  return server;
}

export function listenOn(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolveListen(typeof address === 'object' && address !== null ? address.port : port);
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((done) => {
    server.close(() => done());
    server.closeAllConnections();
  });
}
