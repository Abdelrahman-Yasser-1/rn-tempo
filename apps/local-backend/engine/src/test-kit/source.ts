import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { join, resolve } from 'node:path';

import { parseTestSnapshot, snapshotOfFolder, type TestSnapshot } from '../test-snapshot.ts';

export interface SourceOptions {
  /** A backend URL (`https://host/b/name`) or the path of a backend folder. */
  source: string;
  /** A `read-definition` key, for a URL. Never printed. */
  apiKey?: string | undefined;
  /** Where downloads are cached (relative paths are from the working directory). */
  cacheDir: string;
  /** Where warnings go (default: a line on stderr). */
  warn?: (message: string) => void;
  /** Milliseconds to wait for the server (default 10 000). */
  timeoutMs?: number;
}

export interface LoadedSource {
  snapshot: TestSnapshot;
  /** `folder`, `download`, `not-modified` (the cache is current) or `cache` (the network failed). */
  from: 'folder' | 'download' | 'not-modified' | 'cache';
}

interface Answer {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

const MAX_DOWNLOAD = 64 * 1024 * 1024;

/** One GET with `node:http(s)`, so it works the same under any Jest environment (React Native's replaces `fetch`). */
function get(url: URL, headers: Record<string, string>, timeoutMs: number): Promise<Answer> {
  return new Promise((done, fail) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_DOWNLOAD) req.destroy(new Error('the answer is too large'));
        else chunks.push(chunk);
      });
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', fail);
    });
    req.on('timeout', () => req.destroy(new Error(`no answer within ${String(timeoutMs)} ms`)));
    req.on('error', fail);
    req.end();
  });
}

const isLoopback = (host: string): boolean => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

/** A short, text-only reason for an error of the network layer (no URL query, no key). */
const why = (error: unknown): string => {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : error instanceof Error ? error.message : String(error);
};

function readCache(base: string): { etag: string; text: string } | undefined {
  try {
    const etag = readFileSync(`${base}.etag`, 'utf8').trim();
    const text = readFileSync(`${base}.json`, 'utf8');
    return etag === '' ? undefined : { etag, text };
  } catch {
    return undefined;
  }
}

function writeCache(base: string, etag: string, text: string): void {
  mkdirSync(join(base, '..'), { recursive: true });
  // The JSON first and the ETag last: a half-written pair is never taken for a valid one.
  for (const [suffix, content] of [['.json', text], ['.etag', etag]] as const) {
    const temp = `${base}${suffix}.${String(process.pid)}.tmp`;
    writeFileSync(temp, content, { mode: 0o600 });
    renameSync(temp, `${base}${suffix}`);
  }
}

/**
 * Finds the backend to test against. A folder is read as it is. A URL is downloaded with the key and cached by ETag:
 * the next run asks with `If-None-Match` and a 304 reuses the cache, and when the network fails but a cache exists the
 * cache is used with a warning. With neither, the error says what to do.
 */
export async function loadSource(options: SourceOptions): Promise<LoadedSource> {
  const warn = options.warn ?? ((message: string): void => void process.stderr.write(`${message}\n`));
  if (!/^https?:\/\//i.test(options.source)) {
    const dir = resolve(options.source);
    if (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
      throw new Error(`TEMPO_BACKEND "${options.source}" is neither a backend folder nor an http(s) URL. Set it to a folder with backend.json or to https://<server>/b/<name>.`);
    }
    return { snapshot: snapshotOfFolder(dir), from: 'folder' };
  }
  const base = new URL(options.source.replace(/\/+$/, ''));
  if (base.protocol === 'http:' && !isLoopback(base.hostname)) {
    throw new Error('The backend URL uses http and is not on this machine. Use https, so the API key is not sent in the clear.');
  }
  if (options.apiKey === undefined || options.apiKey === '') {
    throw new Error('Set TEMPO_BACKEND_KEY to a read-definition API key of the backend (or pass apiKey).');
  }
  const url = new URL(`${base.pathname.replace(/\/$/, '')}/__definition`, base);
  const label = `${base.origin}${base.pathname.replace(/\/$/, '')}`;
  const cacheBase = join(resolve(options.cacheDir), createHash('sha256').update(label).digest('hex').slice(0, 24));
  const cached = readCache(cacheBase);
  let answer: Answer;
  try {
    answer = await get(url, { authorization: `Bearer ${options.apiKey}`, accept: 'application/json', ...(cached === undefined ? {} : { 'if-none-match': cached.etag }) }, options.timeoutMs ?? 10_000);
  } catch (error) {
    if (cached === undefined) {
      throw new Error(`Could not reach ${label} (${why(error)}) and there is no cached copy in ${options.cacheDir}. Run once while online, or point TEMPO_BACKEND at a backend folder.`);
    }
    warn(`[tempo-backend] ${label} is not reachable (${why(error)}); using the cached copy.`);
    return { snapshot: parseTestSnapshot(cached.text), from: 'cache' };
  }
  if (answer.status === 304 && cached !== undefined) return { snapshot: parseTestSnapshot(cached.text), from: 'not-modified' };
  if (answer.status >= 500 && cached !== undefined) {
    warn(`[tempo-backend] ${label} answered ${String(answer.status)}; using the cached copy.`);
    return { snapshot: parseTestSnapshot(cached.text), from: 'cache' };
  }
  if (answer.status === 401 || answer.status === 403) throw new Error(`${label} refused the API key (${String(answer.status)}). It needs the read-definition scope for this backend.`);
  if (answer.status !== 200) throw new Error(`${label} answered ${String(answer.status)} for the test snapshot.`);
  const snapshot = parseTestSnapshot(answer.body);
  const etag = answer.headers.etag;
  if (typeof etag === 'string' && etag !== '') writeCache(cacheBase, etag, answer.body);
  return { snapshot, from: 'download' };
}
