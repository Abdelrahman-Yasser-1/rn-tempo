import { lstatSync, realpathSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { Reply } from './http.ts';
import { jsonReply, problemReply } from './http.ts';
import type { EngineLogger } from './logs.ts';

/**
 * Handlers are TRUSTED CODE. They run in a worker thread so a loop or a crash cannot stop the engine, with a
 * heap limit and a hard timeout, but a worker is not a sandbox: it can read files, open sockets and use the
 * network like any Node program. Only open backends you trust.
 */

/** The code of a worker. Plain JavaScript in a string, so it works from `node src/cli.ts`, the tsdown bundle and a SEA alike. */
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
const modules = new Map();
const pending = new Map();
let nextCall = 1;
const call = (method, args) => new Promise((resolve, reject) => {
  const id = nextCall++;
  pending.set(id, { resolve, reject });
  parentPort.postMessage({ type: 'rpc', id, method, args });
});
const log = (level) => (message, fields) => { parentPort.postMessage({ type: 'log', level, message: String(message), fields }); };
parentPort.on('message', async (msg) => {
  if (msg.type === 'rpc-result') {
    const entry = pending.get(msg.id);
    if (entry === undefined) return;
    pending.delete(msg.id);
    if (msg.ok) entry.resolve(msg.value); else entry.reject(new Error(msg.error));
    return;
  }
  if (msg.type !== 'run') return;
  try {
    let mod = modules.get(msg.file);
    if (mod === undefined) {
      mod = await import(pathToFileURL(msg.file).href);
      modules.set(msg.file, mod);
    }
    let fn = mod.default;
    if (fn && typeof fn !== 'function' && typeof fn.default === 'function') fn = fn.default;
    if (typeof fn !== 'function') throw new Error('The handler file must export a default function: export default async function (ctx) { ... }');
    const ctx = {
      req: msg.req,
      auth: { user: msg.req.user },
      scenario: msg.scenario,
      db: {
        list: (collection, query) => call('db.list', [collection, query]),
        get: (collection, id) => call('db.get', [collection, id]),
        count: (collection) => call('db.count', [collection]),
        create: (collection, data) => call('db.create', [collection, data]),
        update: (collection, id, data) => call('db.update', [collection, id, data]),
        delete: (collection, id) => call('db.delete', [collection, id]),
      },
      users: { count: () => call('users.count', []) },
      media: {
        get: (id) => call('media.get', [id, msg.origin]),
        url: (id) => call('media.url', [id, msg.origin]),
      },
      log: { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') },
    };
    const value = await fn(ctx);
    parentPort.postMessage({ type: 'result', ok: true, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort.postMessage({ type: 'result', ok: false, error: message.slice(0, 500) });
  }
});
`;

export const MAX_WORKERS = 4;
const MAX_QUEUE = 100;
const HEAP_MB = 128;

export type HandlerRpc = (method: string, args: unknown[]) => unknown;

export interface HandlerRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, unknown>;
  body: unknown;
  user: { id: number; username: string } | undefined;
}

export interface RunJob {
  /** Absolute, already resolved to a real path inside `handlers/`. */
  file: string;
  req: HandlerRequest;
  scenario: string | undefined;
  origin: string | undefined;
  timeoutMs: number;
  rpc: HandlerRpc;
  /** Names the endpoint in logs. */
  label: string;
}

export type RunResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'timeout' }
  | { kind: 'error'; message: string }
  | { kind: 'crash'; message: string };

interface Slot {
  worker: Worker;
  generation: number;
  job: { run: RunJob; settle: (result: RunResult) => void; timer: NodeJS.Timeout } | undefined;
  dead: boolean;
  /** The last `error` the worker raised (kept for the exit report). */
  failure: string | undefined;
}

interface Waiting {
  run: RunJob;
  resolve: (result: RunResult) => void;
}

/** A small pool of workers, one request at a time each. */
export class HandlerPool {
  private readonly logger: EngineLogger | undefined;
  private readonly slots = new Set<Slot>();
  private readonly queue: Waiting[] = [];
  private readonly signatures = new Map<string, string>();
  private generation = 0;
  private closed = false;
  private watcher: FSWatcher | undefined;
  private watched: string | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(logger?: EngineLogger) {
    this.logger = logger;
  }

  /** Runs `job`; resolves with its value or why it did not finish. Never rejects. */
  run(job: RunJob): Promise<RunResult> {
    if (this.closed) return Promise.resolve({ kind: 'error', message: 'The engine is stopping.' });
    this.checkFile(job.file);
    return new Promise((resolveRun) => {
      const idle = [...this.slots].find((slot) => slot.job === undefined && !slot.dead && slot.generation === this.generation);
      if (idle !== undefined) return this.start(idle, job, resolveRun);
      if (this.slots.size < MAX_WORKERS) return this.start(this.spawn(), job, resolveRun);
      if (this.queue.length >= MAX_QUEUE) return resolveRun({ kind: 'error', message: 'Too many handler requests are waiting.' });
      this.queue.push({ run: job, resolve: resolveRun });
    });
  }

  /** A handler file changed: workers are replaced, so the next request loads the new code. */
  recycle(): void {
    this.generation += 1;
    this.signatures.clear();
    for (const slot of [...this.slots]) if (slot.job === undefined) this.retire(slot);
    this.pump();
  }

  /** Watches the `handlers/` folder (when it exists) and recycles the workers on any change. */
  watchFolder(folder: string): void {
    if (this.closed || this.watched === folder) return;
    try {
      this.watcher = watch(folder, { recursive: true }, () => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.recycle(), 50);
      });
      this.watcher.on('error', () => this.unwatch());
      this.watched = folder;
    } catch {
      // The folder is not there yet; the file signature check below still notices edits.
    }
  }

  private unwatch(): void {
    this.watcher?.close();
    this.watcher = undefined;
    this.watched = undefined;
  }

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.timer);
    this.unwatch();
    for (const waiting of this.queue.splice(0)) waiting.resolve({ kind: 'error', message: 'The engine is stopping.' });
    await Promise.all([...this.slots].map((slot) => this.retire(slot)));
  }

  /** Notices an edited file even when the watcher missed it (or the folder did not exist at start). */
  private checkFile(file: string): void {
    let signature: string;
    try {
      const stat = lstatSync(file);
      signature = `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
    } catch {
      return;
    }
    const before = this.signatures.get(file);
    if (before !== undefined && before !== signature) this.recycle();
    this.signatures.set(file, signature);
  }

  private spawn(): Slot {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      stdout: true,
      stderr: true,
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    const slot: Slot = { worker, generation: this.generation, job: undefined, dead: false, failure: undefined };
    this.slots.add(slot);
    const forward = (level: 'info' | 'warn') => (chunk: Buffer): void => {
      this.logger?.[level]({ handler: slot.job?.run.label }, `handler output: ${chunk.toString('utf8').trimEnd().slice(0, 2000)}`);
    };
    worker.stdout.on('data', forward('info'));
    worker.stderr.on('data', forward('warn'));
    worker.on('message', (message: unknown) => this.onMessage(slot, message));
    worker.on('error', (error: Error & { code?: string }) => {
      slot.failure = error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? `The handler ran out of memory (limit ${HEAP_MB} MB).` : error.message.slice(0, 500);
    });
    worker.on('exit', () => {
      slot.dead = true;
      this.slots.delete(slot);
      const job = slot.job;
      if (job !== undefined) {
        clearTimeout(job.timer);
        slot.job = undefined;
        job.settle({ kind: 'crash', message: slot.failure ?? 'The handler worker stopped unexpectedly.' });
      }
      this.pump();
    });
    return slot;
  }

  private start(slot: Slot, run: RunJob, settle: (result: RunResult) => void): void {
    const timer = setTimeout(() => {
      const job = slot.job;
      if (job === undefined) return;
      slot.job = undefined;
      slot.dead = true;
      this.slots.delete(slot);
      void slot.worker.terminate(); // a hard stop: it works even inside `while (true) {}`
      job.settle({ kind: 'timeout' });
      this.pump();
    }, run.timeoutMs);
    slot.job = { run, settle, timer };
    slot.worker.postMessage({ type: 'run', file: run.file, req: run.req, scenario: run.scenario, origin: run.origin });
  }

  private onMessage(slot: Slot, message: unknown): void {
    const job = slot.job;
    if (job === undefined || typeof message !== 'object' || message === null) return;
    const data = message as { type?: string; id?: number; method?: string; args?: unknown[]; ok?: boolean; value?: unknown; error?: string; level?: string; message?: string; fields?: unknown };
    if (data.type === 'rpc' && typeof data.method === 'string') {
      const reply = (ok: boolean, payload: unknown): void => {
        if (slot.job === job && !slot.dead) slot.worker.postMessage(ok ? { type: 'rpc-result', id: data.id, ok, value: payload } : { type: 'rpc-result', id: data.id, ok, error: String(payload) });
      };
      void (async (): Promise<void> => {
        try {
          reply(true, await job.run.rpc(data.method ?? '', Array.isArray(data.args) ? data.args : []));
        } catch (error) {
          reply(false, error instanceof Error ? error.message : String(error));
        }
      })();
    } else if (data.type === 'log') {
      const level = data.level === 'warn' || data.level === 'error' ? data.level : 'info';
      void job.run.rpc('log', [level, data.message ?? '', data.fields]);
    } else if (data.type === 'result') {
      clearTimeout(job.timer);
      slot.job = undefined;
      job.settle(data.ok === true ? { kind: 'ok', value: data.value } : { kind: 'error', message: data.error ?? 'The handler failed.' });
      if (slot.generation !== this.generation) void this.retire(slot);
      this.pump();
    }
  }

  private retire(slot: Slot): Promise<unknown> {
    slot.dead = true;
    this.slots.delete(slot);
    return slot.worker.terminate();
  }

  /** Starts waiting jobs on free or new workers. */
  private pump(): void {
    while (this.queue.length > 0 && !this.closed) {
      const idle = [...this.slots].find((slot) => slot.job === undefined && !slot.dead && slot.generation === this.generation);
      const slot = idle ?? (this.slots.size < MAX_WORKERS ? this.spawn() : undefined);
      const next = this.queue.shift();
      if (slot === undefined || next === undefined) {
        if (next !== undefined) this.queue.unshift(next);
        return;
      }
      this.start(slot, next.run, next.resolve);
    }
  }
}

// ---- files

export class HandlerFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandlerFileError';
  }
}

/**
 * The real path of `file` (like `handlers/hello.js`) inside `<dir>/handlers`. Symbolic links are resolved first,
 * so a link that leads outside the folder is refused.
 */
export function resolveHandlerFile(dir: string, file: string): string {
  let folder: string;
  try {
    folder = realpathSync(join(dir, 'handlers'));
  } catch {
    throw new HandlerFileError('There is no handlers folder in the backend.');
  }
  let real: string;
  try {
    real = realpathSync(resolve(dir, file));
  } catch {
    throw new HandlerFileError(`Handler file not found: ${file}`);
  }
  if (!real.startsWith(folder + sep)) throw new HandlerFileError(`The handler file "${file}" is outside the handlers folder.`);
  if (!statSync(real).isFile()) throw new HandlerFileError(`The handler "${file}" is not a file.`);
  return real;
}

// ---- answers

const FORBIDDEN_HEADERS = new Set(['content-length', 'transfer-encoding', 'connection', 'keep-alive', 'upgrade', 'te', 'trailer']);

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);

/** `{ status, headers?, body? }` is a full answer; anything else is the body of a 200 (`undefined` is a 204). */
export function replyFromHandler(value: unknown): Reply {
  const shaped =
    isPlain(value) &&
    Object.keys(value).every((key) => key === 'status' || key === 'headers' || key === 'body') &&
    typeof value.status === 'number' &&
    Number.isInteger(value.status) &&
    value.status >= 200 &&
    value.status <= 599;
  const status = shaped ? Number(value.status) : value === undefined ? 204 : 200;
  const body = shaped ? value.body : value;
  const headers: Record<string, string> = {};
  if (shaped && isPlain(value.headers)) {
    for (const [name, header] of Object.entries(value.headers)) {
      const key = name.toLowerCase();
      if (typeof header === 'string' && /^[a-z0-9-]+$/.test(key) && !FORBIDDEN_HEADERS.has(key)) headers[key] = header;
    }
  }
  if (status === 204 || status === 304 || body === undefined) return { status, headers };
  const type = headers['content-type'];
  if (body instanceof Uint8Array) return { status, headers: { 'content-type': 'application/octet-stream', ...headers }, raw: body };
  if (typeof body === 'string' && type !== undefined && !/json/i.test(type)) return { status, headers, raw: body };
  return jsonReply(status, body, headers);
}

export function handlerFailure(result: Exclude<RunResult, { kind: 'ok' }>): Reply {
  switch (result.kind) {
    case 'timeout':
      return problemReply(504, { title: 'Gateway Timeout', detail: 'The handler took too long and was stopped.' });
    case 'crash':
      return problemReply(500, { detail: `The handler stopped: ${result.message}` });
    case 'error':
      return problemReply(500, { detail: `The handler failed: ${result.message}` });
  }
}
