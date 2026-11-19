import { closeSync, constants, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { createCerts, lanAddress, realRunner } from '@rn-tempo/dev-api';

import { startBackend, type RunningBackend, type StartOptions } from './app.ts';
import { errorReply } from './admin.ts';
import { createBackend, DEFINITION_FILE, PRESETS, prepareDataDir, readDefinitionText, type Preset } from './folder.ts';
import type { BackendHost } from './hub.ts';
import { jsonReply, problemReply, readJson, type Reply, type RequestCtx } from './http.ts';
import { DefinitionError } from './schema.ts';
import { importSnapshot } from './snapshot.ts';

/** A backend's folder name: it is the backend's id in the dashboard and in `/__admin/b/<id>`. */
export const BACKEND_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const STATE_FILE = '.hub.json';
const FIRST_PORT = 8443;
const MAX_UPLOAD = 512 * 1024 * 1024;
const MAX_REPLY_BYTES = 16 * 1024 * 1024;
const PUBLIC_HEADERS = new Set(['content-type', 'authorization', 'accept', 'x-tempo-scenario']);

export interface BackendStatusJson {
  path: string;
  name: string;
  state: 'stopped' | 'starting' | 'running' | 'error';
  scheme: 'http' | 'https' | null;
  port: number | null;
  notice: string | null;
  error: string | null;
  logTail: string[];
}

interface Entry {
  running?: RunningBackend;
  starting?: Promise<RunningBackend>;
  error?: string;
}

const HANDLER_EXAMPLE = "// A handler answers requests with your own code. It is trusted code, not a sandbox.\nexport default async function (ctx) {\n  ctx.log.info('handler called', { method: ctx.req.method });\n  return { status: 200, body: { ok: true, path: ctx.req.path } };\n}\n";

const handlerNameOk = (name: string): boolean => {
  const at = name.lastIndexOf('.');
  if (at < 1) return false;
  const stem = name.slice(0, at);
  return ['js', 'mjs', 'cjs'].includes(name.slice(at + 1)) && stem.length <= 64 && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(stem) && !stem.includes('..');
};

const firstLine = (error: unknown, fallback: string): string => (error instanceof Error ? error.message.split('\n')[0] || fallback : fallback);

function isFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/** True when nothing listens on the port (on every address a backend would use). */
function portFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createNetServer();
    probe.once('error', () => done(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => done(true)));
  });
}

export interface RegistryOptions {
  /** Passed to every `startBackend` (tests pass `{ https: false, host: '127.0.0.1' }`). */
  start?: StartOptions;
  /** The first port tried for a new backend (default 8443). */
  firstPort?: number;
  /**
   * Team server: no backend gets a port. Each one is mounted at `/b/<id>` on the server's own port, started when the
   * server starts, and "Try it" calls the engine in process.
   */
  mounted?: boolean;
  /** Team server: checks the `x-tempo-access-key` of a backend with `publicAccess: "key"`. */
  accessKey?: (id: string, key: string | undefined) => boolean;
}

/**
 * Several backends in one process, each in its own folder under one backends directory: its own database, media,
 * logs and public port. The folder name is the id. The list is the folders that have a `backend.json`, minus the ones
 * removed from the list (`.hub.json` keeps those; the folders themselves are never deleted).
 */
export class BackendRegistry implements BackendHost {
  readonly dir: string;
  private readonly entries = new Map<string, Entry>();
  private readonly options: RegistryOptions;

  constructor(dir: string, options: RegistryOptions = {}) {
    this.dir = resolve(dir);
    this.options = options;
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (lstatSync(this.dir).isSymbolicLink()) throw new DefinitionError(`The backends directory is a symbolic link and is not used: ${this.dir}`);
  }

  // ---- the list

  private folder(id: string): string {
    if (!BACKEND_ID.test(id)) throw new DefinitionError('Use a folder name of lower case letters, digits, dash and underscore (up to 48).');
    return join(this.dir, id);
  }

  private hasBackend(id: string): boolean {
    try {
      const folder = join(this.dir, id);
      return lstatSync(folder).isDirectory() && isFile(join(folder, DEFINITION_FILE));
    } catch {
      return false;
    }
  }

  private removed(): Set<string> {
    try {
      const parsed = JSON.parse(readFileSync(join(this.dir, STATE_FILE), 'utf8')) as { removed?: unknown };
      return new Set(Array.isArray(parsed.removed) ? parsed.removed.filter((item): item is string => typeof item === 'string') : []);
    } catch {
      return new Set();
    }
  }

  private saveRemoved(removed: Set<string>): void {
    writeFileSync(join(this.dir, STATE_FILE), `${JSON.stringify({ removed: [...removed].sort() }, null, 2)}\n`, { mode: 0o600 });
  }

  private allIds(): string[] {
    return readdirSync(this.dir)
      .filter((name) => BACKEND_ID.test(name) && this.hasBackend(name))
      .sort();
  }

  /** Ids shown in the dashboard. */
  listedIds(): string[] {
    const removed = this.removed();
    return this.allIds().filter((id) => !removed.has(id));
  }

  /** Folders that hold a backend but were removed from the list. */
  unlistedIds(): string[] {
    const removed = this.removed();
    return this.allIds().filter((id) => removed.has(id));
  }

  private entry(id: string): Entry {
    let entry = this.entries.get(id);
    if (entry === undefined) {
      entry = {};
      this.entries.set(id, entry);
    }
    return entry;
  }

  status(id: string): BackendStatusJson {
    const entry = this.entries.get(id);
    let name = id;
    let broken: string | undefined;
    try {
      name = readDefinitionText(join(this.folder(id), DEFINITION_FILE)).definition.name;
    } catch (error) {
      broken = firstLine(error, 'The definition cannot be read.');
    }
    const running = entry?.running;
    const error = entry?.error ?? broken ?? null;
    return {
      path: id,
      name,
      state: running !== undefined ? 'running' : entry?.starting !== undefined ? 'starting' : error !== null ? 'error' : 'stopped',
      scheme: running?.scheme ?? null,
      port: running?.port ?? null,
      notice: running?.notice ?? null,
      error: running === undefined ? error : null,
      logTail: [],
    };
  }

  list(): BackendStatusJson[] {
    return this.listedIds().map((id) => this.status(id));
  }

  // ---- changes

  /** A free port for a new backend: the first one from 8443 up that no listed backend uses and nothing listens on. */
  private async freePort(): Promise<number> {
    const used = new Set<number>();
    for (const id of this.allIds()) {
      try {
        used.add(readDefinitionText(join(this.dir, id, DEFINITION_FILE)).definition.port);
      } catch {
        // A broken definition holds no port.
      }
    }
    if (this.options.mounted === true) return this.options.firstPort ?? FIRST_PORT;
    for (let port = this.options.firstPort ?? FIRST_PORT; port < 65_535; port += 1) {
      if (!used.has(port) && (await portFree(port))) return port;
    }
    throw new DefinitionError('No free port found.');
  }

  async create(input: { id: string; name: string; preset: Preset; port: number | null }): Promise<BackendStatusJson> {
    const folder = this.folder(input.id);
    if (existsSync(folder)) throw new ConflictError(`A folder named "${input.id}" already exists in the backends directory. Open it instead, or pick another name.`);
    if (!(PRESETS as readonly string[]).includes(input.preset)) throw new DefinitionError(`Unknown preset "${input.preset}".`);
    const name = input.name.trim();
    if (name === '' || name.length > 64) throw new DefinitionError('Give the backend a name of up to 64 characters.');
    if (input.port !== null && !(Number.isInteger(input.port) && input.port >= 1 && input.port <= 65_535)) throw new DefinitionError('The port must be a number from 1 to 65535.');
    try {
      createBackend(folder, { name, preset: input.preset, port: input.port ?? (await this.freePort()) });
    } catch (error) {
      rmSync(folder, { recursive: true, force: true });
      throw error;
    }
    prepareDataDir(folder);
    this.unremove(input.id);
    return this.status(input.id);
  }

  private unremove(id: string): void {
    const removed = this.removed();
    if (removed.delete(id)) this.saveRemoved(removed);
  }

  open(name: string): BackendStatusJson {
    this.folder(name);
    if (!this.hasBackend(name)) throw new NotListedError(`There is no backend folder "${name}" in the backends directory.`);
    this.unremove(name);
    return this.status(name);
  }

  async remove(id: string): Promise<void> {
    this.known(id);
    await this.stop(id);
    const removed = this.removed();
    removed.add(id);
    this.saveRemoved(removed);
    this.entries.delete(id);
  }

  private known(id: string): string {
    const folder = this.folder(id);
    if (!this.hasBackend(id) || this.removed().has(id)) throw new NotListedError(`No backend "${id}".`);
    return folder;
  }

  async start(id: string, port: number | null): Promise<BackendStatusJson> {
    const folder = this.known(id);
    const entry = this.entry(id);
    if (entry.running !== undefined) return this.status(id);
    if (port !== null && !(Number.isInteger(port) && port >= 1 && port <= 65_535)) throw new DefinitionError('The port must be a number from 1 to 65535.');
    const mounted = this.options.mounted === true;
    const accessKey = this.options.accessKey;
    entry.starting ??= startBackend(folder, {
      host: '0.0.0.0',
      ...(this.options.start ?? {}),
      ...(port === null ? {} : { port }),
      adminListener: false,
      ...(mounted ? { mounted: { prefix: `/b/${id}` }, https: false } : {}),
      ...(accessKey === undefined ? {} : { accessKey: (key: string | undefined): boolean => accessKey(id, key) }),
    });
    try {
      entry.running = await entry.starting;
      delete entry.error;
    } catch (error) {
      const code = (error as { code?: string }).code;
      entry.error = code === 'EADDRINUSE' ? `That port is already in use. Choose another port in Settings, or stop whatever uses it.` : firstLine(error, 'The backend could not start.');
      throw new ConflictError(entry.error);
    } finally {
      delete entry.starting;
    }
    return this.status(id);
  }

  async stop(id: string): Promise<BackendStatusJson> {
    this.known(id);
    const entry = this.entries.get(id);
    if (entry?.starting !== undefined) await entry.starting.catch(() => undefined);
    const running = entry?.running;
    if (entry !== undefined) {
      delete entry.running;
      delete entry.error;
    }
    await running?.stop();
    return this.status(id);
  }

  /** Starts every listed backend that is not running (the team server does this at boot). Failures stay in the status. */
  async startAll(): Promise<void> {
    for (const id of this.listedIds()) {
      try {
        await this.start(id, null);
      } catch {
        // The reason is in `status(id).error`.
      }
    }
  }

  /** The running backend, if any (the team server reads its engine and handlers). */
  running(id: string): RunningBackend | undefined {
    return this.entries.get(id)?.running;
  }

  /** Stops every backend (the server is closing). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((id) => this.entries.get(id)?.running?.stop()));
    this.entries.clear();
  }

  // ---- the admin API of a running backend

  admin(id: string): ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | Reply {
    try {
      this.known(id);
    } catch {
      return problemReply(404, { detail: `No backend "${id}".` });
    }
    const running = this.entries.get(id)?.running;
    if (running === undefined) return problemReply(409, { detail: `${id} is stopped. Start it on the Dashboard tab first.` });
    return running.handleAdmin;
  }

  // ---- things the desktop app does with its Rust side

  private certInfo(id: string): Reply {
    const certs = join(this.known(id), '.data', 'certs');
    return jsonReply(200, { hasCert: isFile(join(certs, 'cert.pem')) && isFile(join(certs, 'key.pem')), hasCa: isFile(join(certs, 'rootCA.pem')), lan: lanAddress() ?? null });
  }

  private makeCerts(id: string): Reply {
    const folder = this.known(id);
    try {
      createCerts({ outDir: join(prepareDataDir(folder), 'certs'), extraHosts: [], install: false, lan: lanAddress() }, realRunner, () => undefined);
      return jsonReply(200, { code: 0, stdout: 'Certificate written. Nothing was added to a trust store.', stderr: '' });
    } catch (error) {
      return jsonReply(200, { code: 1, stdout: '', stderr: firstLine(error, 'mkcert failed.') });
    }
  }

  private createHandler(id: string, name: unknown): Reply {
    const folder = this.known(id);
    if (typeof name !== 'string' || !handlerNameOk(name)) return problemReply(400, { detail: 'Use a plain name such as hello.js (letters, digits, dash, underscore).' });
    const dir = join(folder, 'handlers');
    try {
      const stat = lstatSync(dir, { throwIfNoEntry: false });
      if (stat === undefined) mkdirSync(dir);
      else if (stat.isSymbolicLink() || !stat.isDirectory()) return problemReply(400, { detail: 'The handlers folder is a link, so nothing was written there.' });
      writeFileSync(join(dir, name), HANDLER_EXAMPLE, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      return problemReply(409, { detail: (error as NodeJS.ErrnoException).code === 'EEXIST' ? `handlers/${name} already exists.` : 'The handler file could not be written.' });
    }
    return jsonReply(200, { file: `handlers/${name}` });
  }

  private engineLog(id: string): Reply {
    const file = join(this.known(id), '.data', 'logs', 'engine.log');
    try {
      const size = statSync(file).size;
      const text = readFileSync(file, 'utf8').slice(-Math.min(size, 256 * 1024));
      return jsonReply(200, text.split('\n').filter((line) => line !== '').slice(-200));
    } catch {
      return jsonReply(200, []);
    }
  }

  /** "Try it": the dashboard cannot call another port (CSP `connect-src 'self'`), so the server does, trusting only this backend's own CA. */
  private async tryIt(id: string, ctx: RequestCtx): Promise<Reply> {
    this.known(id);
    const running = this.entries.get(id)?.running;
    if (running === undefined) return problemReply(409, { detail: 'Start the backend first.' });
    const parsed = readJson(ctx);
    if (!parsed.ok) return parsed.reply;
    const body = (typeof parsed.value === 'object' && parsed.value !== null ? parsed.value : {}) as { method?: unknown; path?: unknown; headers?: unknown; body?: unknown };
    const method = typeof body.method === 'string' ? body.method.toUpperCase() : '';
    const path = typeof body.path === 'string' ? body.path : '';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return problemReply(400, { detail: `${method} is not an allowed method.` });
    if (!publicPathOk(path)) return problemReply(400, { detail: 'That path cannot be tried.' });
    if (typeof body.body === 'string' && Buffer.byteLength(body.body) > 8 * 1024 * 1024) return problemReply(400, { detail: 'The request body is too large.' });
    const headers: Record<string, string> = {};
    if (Array.isArray(body.headers)) {
      for (const pair of body.headers) {
        if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string' && PUBLIC_HEADERS.has(pair[0].toLowerCase()) && !/[\r\n]/.test(pair[1])) headers[pair[0].toLowerCase()] = pair[1];
      }
    }
    if (this.options.mounted === true) return this.tryInProcess(running, { method, path, headers, ...(typeof body.body === 'string' && method !== 'GET' ? { body: body.body } : {}) });
    const secure = running.scheme === 'https';
    let ca: Buffer | undefined;
    if (secure) {
      try {
        ca = readFileSync(join(running.engine.folder.dataDir, 'certs', 'rootCA.pem'));
      } catch {
        return problemReply(409, { detail: 'This backend uses HTTPS but has no CA file yet. Create the certificate in Settings.' });
      }
    }
    const payload = typeof body.body === 'string' && method !== 'GET' ? body.body : undefined;
    const started = Date.now();
    return new Promise<Reply>((done) => {
      // Certificate checks stay on: the request trusts only this backend's rootCA.pem, and the name checked is `localhost`.
      const send = secure ? httpsRequest : httpRequest;
      const req = send({ host: '127.0.0.1', port: running.port, path, method, headers: { ...headers, ...(payload === undefined ? {} : { 'content-length': String(Buffer.byteLength(payload)) }) }, timeout: 30_000, ...(secure ? { ca, servername: 'localhost' } : {}) }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_REPLY_BYTES) {
            req.destroy();
            done(problemReply(502, { detail: 'The reply is larger than 16 MB.' }));
          } else chunks.push(chunk);
        });
        res.on('end', () => done(jsonReply(200, { status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - started, contentType: res.headers['content-type'] ?? null })));
      });
      req.on('timeout', () => req.destroy(new Error('The backend did not answer in 30 seconds.')));
      req.on('error', (error) => done(problemReply(502, { detail: firstLine(error, 'The backend could not be reached.') })));
      req.end(payload);
    });
  }

  /** Team server "Try it": the engine answers in process (no port to call, and the access key is not needed by a signed-in member). */
  private async tryInProcess(running: RunningBackend, call: { method: string; path: string; headers: Record<string, string>; body?: string }): Promise<Reply> {
    const started = Date.now();
    const url = new URL(call.path, 'http://local');
    const reply = await running.engine.handle({
      method: call.method,
      path: url.pathname,
      url: call.path,
      query: url.searchParams,
      headers: call.headers,
      bodyText: call.body ?? '',
    });
    let text = '';
    if (reply.raw !== undefined) text = typeof reply.raw === 'string' ? reply.raw : Buffer.from(reply.raw).toString('utf8');
    else if (reply.body !== undefined) text = JSON.stringify(reply.body);
    else if (reply.file !== undefined) text = `[a stored file, ${String(reply.file.end - reply.file.start + 1)} bytes]`;
    else if (reply.stream !== undefined) {
      reply.stream.destroy();
      text = '[a stream]';
    }
    return jsonReply(200, { status: reply.status, body: text.slice(0, MAX_REPLY_BYTES), ms: Date.now() - started, contentType: reply.headers['content-type'] ?? null });
  }

  /** A backup zip (as a stream) becomes a new backend folder, never overwriting one. */
  private async restore(ctx: RequestCtx): Promise<Reply> {
    const id = ctx.query.get('name') ?? '';
    let folder: string;
    try {
      folder = this.folder(id);
    } catch (error) {
      return problemReply(400, { detail: firstLine(error, 'Bad name.') });
    }
    if (existsSync(folder)) return problemReply(409, { detail: `A folder named "${id}" already exists. Restoring always goes into a new folder.` });
    const stream = ctx.stream;
    if (stream === undefined) return problemReply(400, { detail: 'Send the zip as the request body.' });
    // A private (0700) folder of our own, and a file created with O_EXCL | O_NOFOLLOW inside it: nothing planted in
    // the shared temp folder can be followed or reused.
    const scratch = mkdtempSync(join(tmpdir(), 'tempo-restore-'));
    const temp = join(scratch, 'backup.zip');
    let size = 0;
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_UPLOAD) stream.destroy(new Error('too large'));
    });
    try {
      const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        await pipeline(stream, createWriteStream(temp, { fd, autoClose: false }));
      } finally {
        closeSync(fd);
      }
      await importSnapshot(temp, folder);
      prepareDataDir(folder);
    } catch (error) {
      rmSync(folder, { recursive: true, force: true });
      return problemReply(size > MAX_UPLOAD ? 413 : 400, { detail: size > MAX_UPLOAD ? 'The backup is larger than 512 MB.' : firstLine(error, 'The backup could not be restored.') });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    this.unremove(id);
    return jsonReply(200, this.status(id));
  }

  // ---- the routes under /__hub

  get routes(): BackendHost['routes'] {
    const guarded =
      (run: (ctx: RequestCtx, params: Record<string, string>) => Reply | Promise<Reply>) =>
      async (ctx: RequestCtx, params: Record<string, string>): Promise<Reply> => {
        try {
          return await run(ctx, params);
        } catch (error) {
          if (error instanceof ConflictError) return problemReply(409, { detail: error.message });
          if (error instanceof NotListedError) return problemReply(404, { detail: error.message });
          return errorReply(error);
        }
      };
    const body = (ctx: RequestCtx): Record<string, unknown> | Reply => {
      const parsed = readJson(ctx);
      if (!parsed.ok) return parsed.reply;
      return typeof parsed.value === 'object' && parsed.value !== null && !Array.isArray(parsed.value) ? (parsed.value as Record<string, unknown>) : {};
    };
    const isReply = (value: Record<string, unknown> | Reply): value is Reply => typeof value.status === 'number' && typeof value.headers === 'object';
    const portOf = (value: unknown): number | null => (typeof value === 'number' ? value : null);
    return [
      { method: 'GET', pattern: '/info', handler: () => jsonReply(200, { mode: 'web', backendsDir: this.dir }) },
      { method: 'GET', pattern: '/backends', handler: guarded(() => jsonReply(200, this.list())) },
      { method: 'GET', pattern: '/unlisted', handler: guarded(() => jsonReply(200, this.unlistedIds())) },
      {
        method: 'POST',
        pattern: '/backends',
        handler: guarded(async (ctx) => {
          const input = body(ctx);
          if (isReply(input)) return input;
          return jsonReply(201, await this.create({ id: String(input.id ?? ''), name: String(input.name ?? input.id ?? ''), preset: String(input.preset ?? 'empty') as Preset, port: portOf(input.port) }));
        }),
      },
      {
        method: 'POST',
        pattern: '/backends/open',
        handler: guarded((ctx) => {
          const input = body(ctx);
          return isReply(input) ? input : jsonReply(200, this.open(String(input.name ?? '')));
        }),
      },
      { method: 'DELETE', pattern: '/backends/:id', handler: guarded(async (_ctx, p) => (await this.remove(p.id ?? ''), jsonReply(200, { ok: true }))) },
      {
        method: 'POST',
        pattern: '/backends/:id/start',
        handler: guarded(async (ctx, p) => {
          const input = body(ctx);
          return isReply(input) ? input : jsonReply(200, await this.start(p.id ?? '', portOf(input.port)));
        }),
      },
      { method: 'POST', pattern: '/backends/:id/stop', handler: guarded(async (_ctx, p) => jsonReply(200, await this.stop(p.id ?? ''))) },
      { method: 'GET', pattern: '/backends/:id/cert-info', handler: guarded((_ctx, p) => this.certInfo(p.id ?? '')) },
      { method: 'POST', pattern: '/backends/:id/certs', handler: guarded((_ctx, p) => this.makeCerts(p.id ?? '')) },
      {
        method: 'POST',
        pattern: '/backends/:id/handlers',
        handler: guarded((ctx, p) => {
          const input = body(ctx);
          return isReply(input) ? input : this.createHandler(p.id ?? '', input.name);
        }),
      },
      { method: 'GET', pattern: '/backends/:id/engine-log', handler: guarded((_ctx, p) => this.engineLog(p.id ?? '')) },
      { method: 'POST', pattern: '/backends/:id/try', handler: guarded((ctx, p) => this.tryIt(p.id ?? '', ctx)) },
      { method: 'POST', pattern: '/restore', streamsBody: true, handler: guarded((ctx) => this.restore(ctx)) },
    ];
  }
}

/** A path for "Try it": an ordinary path (and query) on the public API, never an admin or internal route. */
export function publicPathOk(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('#') || path.includes('\\') || path.length > 4096) return false;
  if ([...path].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return false;
  const [route = ''] = path.split('?', 1);
  if (route.split('/').some((segment) => segment === '..' || segment === '.') || /%2e|%2f|%5c|%00/i.test(route)) return false;
  return !route.startsWith('/__admin');
}

export class ConflictError extends Error {}
export class NotListedError extends Error {}
