import { createHash, randomBytes } from 'node:crypto';
import { constants, createWriteStream, lstatSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import busboy from 'busboy';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { ensureRealDir } from './folder.ts';
import { jsonReply, problemReply, type Reply, type RequestCtx } from './http.ts';

export const MEDIA_ID = /^[0-9a-f]{32}$/;
const HEAD_BYTES = 8192;
const JSON_SNIFF_MAX = 1024 * 1024;
const MULTIPART_OVERHEAD = 1024 * 1024;
const MAX_FILES_PER_REQUEST = 20;

export interface MediaRecord {
  id: string;
  originalName: string;
  mime: string;
  size: number;
  sha256: string;
  createdAt: string;
  uploadedBy: number | null;
}

export class TooLargeError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`The file is larger than the limit of ${limit} bytes.`);
    this.name = 'TooLargeError';
    this.limit = limit;
  }
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

// ---- names and types

/** The file name as metadata: no folders, no control characters, at most 255 characters. Never used as a path. */
export function sanitizeName(raw: string | undefined): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').trim().slice(0, 255);
  return clean === '' ? 'file' : clean;
}

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;

/** A declared content type reduced to `type/subtype`, or undefined when it is not a plausible one. */
export function sanitizeMime(raw: string | undefined): string | undefined {
  const base = (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_PATTERN.test(base) ? base : undefined;
}

const startsWith = (head: Buffer, bytes: readonly number[], offset = 0): boolean => bytes.every((byte, index) => head[offset + index] === byte);
const ascii = (head: Buffer, start: number, end: number): string => head.subarray(start, end).toString('latin1');

function looksLikeText(head: Buffer): boolean {
  if (head.length === 0) return false;
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.length === HEAD_BYTES ? head.subarray(0, HEAD_BYTES - 4) : head);
    return true;
  } catch {
    return false;
  }
}

/** The type of the bytes for the common formats, by their magic numbers. `undefined` when unknown. */
export function sniffMime(head: Buffer): string | undefined {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(head, 0, 4) === 'RIFF') {
    const kind = ascii(head, 8, 12);
    if (kind === 'WEBP') return 'image/webp';
    if (kind === 'WAVE') return 'audio/wav';
    if (kind === 'AVI ') return 'video/x-msvideo';
  }
  if (ascii(head, 0, 2) === 'BM' && head.length > 14) return 'image/bmp';
  if (startsWith(head, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return 'image/tiff';
  if (ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12);
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1') return 'image/heic';
    if (brand === 'avif') return 'image/avif';
    if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (ascii(head, 0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(head, 0, 4) === 'fLaC') return 'audio/flac';
  if (ascii(head, 0, 3) === 'ID3' || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(head, 0, 5) === '%PDF-') return 'application/pdf';
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return 'application/zip';
  if (startsWith(head, [0x1f, 0x8b])) return 'application/gzip';
  if (looksLikeText(head)) {
    const start = head.toString('utf8', 0, 2048).replace(/^\uFEFF/, '').trimStart().toLowerCase();
    if (/^<svg[\s>]/.test(start) || (/^<\?xml/.test(start) && start.includes('<svg'))) return 'image/svg+xml';
    if (/^<!doctype html|^<html[\s>]/.test(start)) return 'text/html';
  }
  return undefined;
}

/**
 * The content type to store. The bytes win; if they say nothing the declared type (sanitized) is used, then
 * `text/plain` for plain text and `application/octet-stream`. `whole` is the file, read lazily, to tell JSON.
 */
export function detectMime(head: Buffer, declared: string | undefined, size: number, whole: () => Buffer): string {
  const sniffed = sniffMime(head);
  if (sniffed !== undefined) return sniffed;
  const text = looksLikeText(head);
  if (text && size <= JSON_SNIFF_MAX && /^\s*[[{]/.test(head.toString('utf8', 0, 64).replace(/^\uFEFF/, ''))) {
    try {
      JSON.parse(whole().toString('utf8'));
      return 'application/json';
    } catch {
      // Not JSON after all.
    }
  }
  const claimed = sanitizeMime(declared);
  if (claimed !== undefined && claimed !== 'application/octet-stream') return claimed;
  return text ? 'text/plain' : 'application/octet-stream';
}

/** Types a browser may show in the page. SVG and HTML can run script, so they are always downloads. */
export function isInlineType(mime: string): boolean {
  return /^(image|video|audio)\//.test(mime) && mime !== 'image/svg+xml';
}

/** `inline` or `attachment` with an ASCII fallback name and an RFC 5987 `filename*`. */
export function contentDisposition(name: string, mime: string): string {
  const safe = sanitizeName(name);
  const fallback = safe.replace(/[^\x20-\x7e]/g, '_').replace(/["\\%;]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${isInlineType(mime) ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** One byte range of a `Range` header. `unsatisfiable` is a 416; `ignore` sends the whole file. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'unsatisfiable' | 'ignore' {
  if (header === undefined) return 'ignore';
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return 'ignore'; // other units and several ranges are answered with the whole file
  const [, first = '', last = ''] = match;
  if (first === '' && last === '') return 'ignore';
  if (first === '') {
    const suffix = Number(last);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(size - suffix, 0), end: size - 1 };
  }
  const start = Number(first);
  if (start >= size) return 'unsatisfiable';
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1);
  return end < start ? 'ignore' : { start, end };
}

// ---- the service

export interface SaveOptions {
  name: string | undefined;
  declaredType: string | undefined;
  uploadedBy: number | undefined;
  maxBytes: number;
}

const toRecord = (raw: Record<string, unknown>): MediaRecord => ({
  id: String(raw.id),
  originalName: String(raw.originalName),
  mime: String(raw.mime),
  size: Number(raw.size),
  sha256: String(raw.sha256),
  createdAt: String(raw.createdAt),
  uploadedBy: raw.uploadedBy === null ? null : Number(raw.uploadedBy),
});

/** Files under `.data/media/<id[0..2]>/<id>`, with their metadata in `_media`. No path ever comes from a request. */
export class MediaService {
  readonly root: string;
  private readonly tmp: string;
  private readonly db: DatabaseSync;
  private readonly now: () => Date;

  constructor(dataDir: string, db: DatabaseSync, now: () => Date) {
    this.root = join(dataDir, 'media');
    this.tmp = join(this.root, '.tmp');
    this.db = db;
    this.now = now;
    ensureRealDir(this.root, '.data/media', true);
    ensureRealDir(this.tmp, '.data/media/.tmp', true);
    // Temp files of an upload that was cut off by a crash.
    for (const name of readdirSync(this.tmp)) {
      try {
        unlinkSync(join(this.tmp, name));
      } catch {
        // Gone already.
      }
    }
  }

  tempFiles(): string[] {
    return readdirSync(this.tmp);
  }

  pathOf(id: string): string {
    if (!MEDIA_ID.test(id)) throw new Error('Invalid media id.');
    return join(this.root, id.slice(0, 2), id);
  }

  /** Streams `source` to a temp file, then renames it into place and records it. Enforces `maxBytes` as bytes arrive. */
  async save(source: Readable, options: SaveOptions): Promise<MediaRecord> {
    const temp = join(this.tmp, randomBytes(16).toString('hex'));
    const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const out = createWriteStream(temp, { fd });
    const hash = createHash('sha256');
    const head: Buffer[] = [];
    let headLength = 0;
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done): void {
        size += chunk.length;
        if (size > options.maxBytes) return done(new TooLargeError(options.maxBytes));
        hash.update(chunk);
        if (headLength < HEAD_BYTES) {
          head.push(chunk.subarray(0, HEAD_BYTES - headLength));
          headLength += Math.min(chunk.length, HEAD_BYTES - headLength);
        }
        done(null, chunk);
      },
    });
    try {
      await pipeline(source, meter, out);
    } catch (error) {
      try {
        unlinkSync(temp);
      } catch {
        // Never created, or removed.
      }
      throw error;
    }
    const id = randomBytes(16).toString('hex');
    const finalPath = this.pathOf(id);
    try {
      ensureRealDir(join(this.root, id.slice(0, 2)), '.data/media shard', true);
      const mime = detectMime(Buffer.concat(head), options.declaredType, size, () => readFileSync(temp));
      renameSync(temp, finalPath);
      const record: MediaRecord = {
        id,
        originalName: sanitizeName(options.name),
        mime,
        size,
        sha256: hash.digest('hex'),
        createdAt: this.now().toISOString(),
        uploadedBy: options.uploadedBy ?? null,
      };
      try {
        this.db
          .prepare('INSERT INTO _media (id, originalName, mime, size, sha256, createdAt, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(record.id, record.originalName, record.mime, record.size, record.sha256, record.createdAt, record.uploadedBy);
      } catch (error) {
        unlinkSync(finalPath);
        throw error;
      }
      return record;
    } catch (error) {
      try {
        unlinkSync(temp);
      } catch {
        // Already renamed.
      }
      throw error;
    }
  }

  get(id: string): MediaRecord | undefined {
    if (!MEDIA_ID.test(id)) return undefined;
    const raw = this.db.prepare('SELECT * FROM _media WHERE id = ?').get(id);
    return raw === undefined ? undefined : toRecord(raw);
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  /** `type` is `image` (a family) or `image/png` (exact). `q` matches the original name. */
  list(options: { type?: string; q?: string; skip?: number; limit?: number } = {}): { items: MediaRecord[]; total: number } {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (options.type !== undefined && options.type !== '') {
      if (options.type.includes('/')) {
        clauses.push('mime = ?');
        params.push(options.type);
      } else {
        clauses.push("mime LIKE ? ESCAPE '\\'");
        params.push(`${options.type.replace(/[\\%_]/g, (char) => `\\${char}`)}/%`);
      }
    }
    if (options.q !== undefined && options.q !== '') {
      clauses.push("originalName LIKE ? ESCAPE '\\'");
      params.push(`%${options.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    }
    const where = clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`;
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS n FROM _media${where}`).get(...params)?.n ?? 0);
    const rows = this.db.prepare(`SELECT * FROM _media${where} ORDER BY createdAt DESC, id LIMIT ? OFFSET ?`).all(...params, options.limit ?? 50, options.skip ?? 0);
    return { items: rows.map(toRecord), total };
  }

  /** Removes the file and its record. Returns false when there is no such media. */
  remove(id: string): boolean {
    const record = this.get(id);
    if (record === undefined) return false;
    try {
      unlinkSync(this.pathOf(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    this.db.prepare('DELETE FROM _media WHERE id = ?').run(id);
    return true;
  }

  usage(): { files: number; bytes: number } {
    const row = this.db.prepare('SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM _media').get();
    return { files: Number(row?.files ?? 0), bytes: Number(row?.bytes ?? 0) };
  }

  /** What the API returns for a stored file. */
  describe(record: MediaRecord, url: string): { id: string; url: string; name: string; mime: string; size: number } {
    return { id: record.id, url, name: record.originalName, mime: record.mime, size: record.size };
  }

  // ---- upload

  /**
   * Reads an upload request: a multipart body (field `file`, several when `multiple`) or a raw body whose
   * `Content-Type` is the file's type. Stops reading as soon as the limit is passed.
   */
  async receive(ctx: RequestCtx, options: { maxBytes: number; multiple: boolean; uploadedBy: number | undefined }): Promise<MediaRecord[]> {
    const req = ctx.stream;
    if (req === undefined) throw new UploadError('This request has no body to read.');
    const contentType = String(req.headers['content-type'] ?? '');
    const declared = Number(req.headers['content-length']);
    const multipart = /^multipart\/form-data/i.test(contentType);
    if (Number.isFinite(declared) && declared > (multipart && options.multiple ? options.maxBytes * MAX_FILES_PER_REQUEST : options.maxBytes) + (multipart ? MULTIPART_OVERHEAD : 0)) {
      throw new TooLargeError(options.maxBytes);
    }
    if (!multipart) {
      const name = ctx.query.get('name') ?? (typeof req.headers['x-file-name'] === 'string' ? req.headers['x-file-name'] : undefined);
      return [await this.save(req, { name, declaredType: contentType, uploadedBy: options.uploadedBy, maxBytes: options.maxBytes })];
    }
    return this.receiveMultipart(req, options);
  }

  private receiveMultipart(req: IncomingMessage, options: { maxBytes: number; multiple: boolean; uploadedBy: number | undefined }): Promise<MediaRecord[]> {
    return new Promise((resolve, reject) => {
      const parser = busboy({
        headers: req.headers,
        limits: { files: options.multiple ? MAX_FILES_PER_REQUEST : 1, fields: 50, fieldSize: 64 * 1024, parts: MAX_FILES_PER_REQUEST + 50 },
      });
      const saving: Promise<MediaRecord>[] = [];
      const streams = new Set<Readable>();
      let failure: unknown;
      const fail = (error: unknown): void => {
        if (failure !== undefined) return;
        failure = error;
        req.unpipe(parser);
        for (const stream of streams) stream.destroy();
        parser.destroy();
        req.resume();
      };
      parser.on('file', (field, stream, info) => {
        if (field !== 'file' || failure !== undefined) {
          stream.resume();
          return;
        }
        streams.add(stream);
        const task = this.save(stream, { name: info.filename, declaredType: info.mimeType, uploadedBy: options.uploadedBy, maxBytes: options.maxBytes });
        task.then(
          () => streams.delete(stream),
          (error: unknown) => {
            streams.delete(stream);
            fail(error);
          },
        );
        saving.push(task);
      });
      parser.on('filesLimit', () => fail(new UploadError(`Send at most ${options.multiple ? MAX_FILES_PER_REQUEST : 1} file${options.multiple ? 's' : ''} per request.`)));
      parser.on('error', fail);
      req.on('error', fail);
      req.on('close', () => {
        if (!req.complete) fail(new UploadError('The upload was cut off.'));
      });
      parser.on('close', () => {
        void Promise.allSettled(saving).then((results) => {
          const saved = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
          if (failure === undefined && saved.length === 0) failure = new UploadError('Send the file in a multipart field named "file".');
          if (failure !== undefined) {
            for (const record of saved) this.remove(record.id); // all or nothing
            reject(failure instanceof Error ? failure : new UploadError('The upload failed.'));
          } else resolve(saved);
        });
      });
      req.pipe(parser);
    });
  }
}

/** The reply to a failed upload: 413 for the size limit, 400 for a bad request, anything else is thrown on. */
export function uploadFailure(error: unknown): Reply {
  if (error instanceof TooLargeError) {
    return problemReply(413, { title: 'Payload Too Large', detail: error.message, headers: { connection: 'close' } });
  }
  if (error instanceof UploadError) return problemReply(400, { detail: error.message });
  if (error instanceof Error && /Unexpected end of form|Malformed|Multipart|Missing|Unsupported content type|ERR_STREAM_PREMATURE_CLOSE|aborted/i.test(`${error.message} ${(error as NodeJS.ErrnoException).code ?? ''}`)) {
    return problemReply(400, { detail: 'The upload could not be read.' });
  }
  throw error;
}

// ---- download

const NOSNIFF = { 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

/** Streams a stored file: type, length, ETag, one `Range`, safe disposition. */
export function downloadReply(service: MediaService, id: string, headers: Record<string, string | string[] | undefined>): Reply {
  const record = service.get(id);
  if (record === undefined) return problemReply(404, { detail: `No media with id '${id}'.` });
  const path = service.pathOf(id);
  let size: number;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error('not a file');
    size = stat.size;
  } catch {
    return problemReply(404, { detail: `The file of media '${id}' is missing.` });
  }
  const etag = `"${record.sha256.slice(0, 32)}"`;
  const base: Record<string, string> = {
    'content-type': record.mime,
    'accept-ranges': 'bytes',
    etag,
    'content-disposition': contentDisposition(record.originalName, record.mime),
    'cache-control': 'private, max-age=0, must-revalidate',
    ...NOSNIFF,
  };
  const none = String(headers['if-none-match'] ?? '');
  if (none !== '' && (none.trim() === '*' || none.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag))) {
    return { status: 304, headers: { etag, ...NOSNIFF } };
  }
  const ifRange = headers['if-range'];
  const rangeHeader = typeof headers.range === 'string' && (ifRange === undefined || ifRange === etag) ? headers.range : undefined;
  const range = parseRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return problemReply(416, { title: 'Range Not Satisfiable', headers: { 'content-range': `bytes */${size}` } });
  }
  if (size === 0) return { status: 200, headers: { ...base, 'content-length': '0' }, raw: '' };
  if (range === 'ignore') return { status: 200, headers: { ...base, 'content-length': String(size) }, file: { path, start: 0, end: size - 1 } };
  return {
    status: 206,
    headers: { ...base, 'content-length': String(range.end - range.start + 1), 'content-range': `bytes ${range.start}-${range.end}/${size}` },
    file: { path, start: range.start, end: range.end },
  };
}

export const uploadJson = (records: { id: string; url: string; name: string; mime: string; size: number }[], multiple: boolean): Reply =>
  jsonReply(201, multiple ? { files: records } : records[0]);
