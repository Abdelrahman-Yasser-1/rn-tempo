import { readFileSync, existsSync } from 'node:fs';
import { closeSync, constants, createReadStream, openSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { join, isAbsolute, resolve } from 'node:path';
import { pipeline } from 'node:stream';

import { CERT_FILE, KEY_FILE } from '@rn-tempo/dev-api';

import type { Engine } from './engine.ts';
import { problemReply, type Reply, type RequestCtx } from './http.ts';

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

export function toCtx(req: IncomingMessage, bodyText: string): RequestCtx {
  const url = req.url ?? '/';
  const parsed = new URL(url, 'http://local');
  const encrypted = (req.socket as { encrypted?: boolean }).encrypted === true;
  const host = typeof req.headers.host === 'string' && /^[A-Za-z0-9.:[\]-]+$/.test(req.headers.host) ? req.headers.host : undefined;
  return {
    method: req.method ?? 'GET',
    path: parsed.pathname,
    url,
    query: parsed.searchParams,
    headers: req.headers,
    bodyText,
    ...(host === undefined ? {} : { origin: `${encrypted ? 'https' : 'http'}://${host}` }),
  };
}

export function sendReply(res: ServerResponse, reply: Reply, headOnly = false): void {
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
  if (reply.file !== undefined && fd !== undefined) {
    // The path comes from a validated media id. `O_NOFOLLOW` keeps a planted link from being read.
    const source = createReadStream(reply.file.path, { fd, start: reply.file.start, end: reply.file.end });
    pipeline(source, res, () => undefined);
    return;
  }
  res.end(headOnly ? undefined : payload);
}

export interface PublicListenOptions {
  port: number;
  host?: string;
  tls?: { cert: Buffer; key: Buffer };
}

/** The public listener. Only the API, `/__health` and the docs live here; there is no admin route. */
export function createPublicServer(
  engine: Engine,
  extra: (ctx: RequestCtx, res: ServerResponse) => boolean,
  tls: PublicListenOptions['tls'],
): Server {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    void (async (): Promise<void> => {
      // An upload streams its own body; every other request is read up front, with a small limit.
      const path = new URL(req.url ?? '/', 'http://local').pathname;
      const streaming = engine.streamsBody(req.method === 'HEAD' ? 'GET' : (req.method ?? 'GET'), path);
      const body = streaming ? { ok: true as const, text: '' } : await readBody(req);
      if (!body.ok) {
        sendReply(res, problemReply(413, { title: 'Payload Too Large', detail: `Bodies are limited to ${MAX_BODY_BYTES} bytes.` }));
        return;
      }
      const head = req.method === 'HEAD';
      const ctx = toCtx(req, body.text);
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
  return tls === undefined ? createHttpServer(handler) : createHttpsServer(tls, handler);
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
