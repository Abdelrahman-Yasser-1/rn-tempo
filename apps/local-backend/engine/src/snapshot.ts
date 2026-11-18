import { createHash } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, realpathSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { PassThrough, Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants as zlibConstants, crc32, createDeflateRaw, createInflateRaw } from 'node:zlib';

import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { DATA_DIR, DEFINITION_FILE, ensureRealDir, prepareDataDir } from './folder.ts';
import { DefinitionError } from './schema.ts';

/** The snapshot format: a `.zip` (deflate, UTF-8 names, no zip64) with these files. See the README. */
export const SNAPSHOT_FORMAT = 1;
export const MANIFEST_FILE = 'manifest.json';
/** What a snapshot never holds. It is written into the manifest too. */
export const SNAPSHOT_EXCLUDED = ['secrets.json', 'certs/'] as const;

export const SNAPSHOT_LIMITS = {
  /** Entries in the archive (a zip without zip64 holds at most 65535). */
  maxEntries: 50_000,
  /** All files together, as declared and as actually inflated. */
  maxTotalBytes: 8 * 1024 ** 3,
  /** One file. Also the zip32 limit. */
  maxFileBytes: 4 * 1024 ** 3 - 1,
  maxManifestBytes: 16 * 1024 * 1024,
  maxDirectoryBytes: 32 * 1024 * 1024,
} as const;

export interface ImportLimits {
  maxEntries?: number;
  maxTotalBytes?: number;
}

const ManifestSchema = z.strictObject({
  format: z.literal(SNAPSHOT_FORMAT),
  engineVersion: z.string(),
  createdAt: z.string(),
  backend: z.string(),
  counts: z.strictObject({
    collections: z.number(),
    endpoints: z.number(),
    users: z.number(),
    mediaFiles: z.number(),
    handlers: z.number(),
    seedFiles: z.number(),
    rows: z.record(z.string(), z.number()),
  }),
  excluded: z.array(z.string()),
  note: z.string(),
  files: z.array(z.strictObject({ path: z.string(), size: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
});
export type SnapshotManifest = z.infer<typeof ManifestSchema>;

// ---- what goes in

interface SourceFile {
  /** The name inside the zip. */
  name: string;
  /** The file on disk. */
  path: string;
  size: number;
}

/**
 * Checks a folder the export reads from: absent is fine (`false`), but a symbolic link, a non-folder, or a path
 * whose real location is outside the backend folder is refused, so a crafted folder cannot pull other files into the zip.
 */
function checkRoot(path: string, backend: string, label: string): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return false;
  if (stat.isSymbolicLink()) throw new DefinitionError(`${label} is a symbolic link and is not exported: ${path}`);
  if (!stat.isDirectory()) throw new DefinitionError(`${label} is not a folder: ${path}`);
  const real = realpathSync(path);
  if (real !== backend && !real.startsWith(backend + sep)) throw new DefinitionError(`${label} is outside the backend folder and is not exported.`);
  return true;
}

/** Regular files under `dir`, as `prefix/relative` names. Links and special files are skipped, never followed. */
function walk(dir: string, prefix: string, skip: ReadonlySet<string> = new Set()): SourceFile[] {
  const out: SourceFile[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (skip.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path, `${prefix}/${entry.name}`));
    else if (entry.isFile()) out.push({ name: `${prefix}/${entry.name}`, path, size: lstatSync(path).size });
  }
  return out;
}

/** Deletes sign-in sessions from a database file: a snapshot never carries refresh tokens. */
export function scrubSessions(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    if (db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = '_refresh_tokens'").get() !== undefined) db.exec('DELETE FROM _refresh_tokens');
  } finally {
    db.close();
  }
}

/** A consistent copy of a database (`VACUUM INTO`: one transaction, so a running engine may keep writing). */
function copyDatabase(source: DatabaseSync | string, target: string): void {
  const db = typeof source === 'string' ? new DatabaseSync(source) : source;
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    if (typeof source === 'string') db.close();
  }
  scrubSessions(target);
}

// ---- the zip writer (streams; deflate with data descriptors)

const dosTime = (date: Date): { time: number; date: number } => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  date: (Math.max(date.getFullYear() - 1980, 0) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

interface Written {
  name: Buffer;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  stamp: { time: number; date: number };
}

function localHeader(name: Buffer, stamp: { time: number; date: number }): Buffer {
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0808, 6); // data descriptor (bit 3) + UTF-8 names (bit 11)
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt16LE(stamp.time, 10);
  head.writeUInt16LE(stamp.date, 12);
  head.writeUInt16LE(name.length, 26);
  return Buffer.concat([head, name]);
}

function descriptor(entry: Written): Buffer {
  const out = Buffer.alloc(16);
  out.writeUInt32LE(0x08074b50, 0);
  out.writeUInt32LE(entry.crc, 4);
  out.writeUInt32LE(entry.compressed, 8);
  out.writeUInt32LE(entry.size, 12);
  return out;
}

function centralRecord(entry: Written): Buffer {
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(0x031e, 4); // made by: Unix, 3.0
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(0x0808, 8);
  head.writeUInt16LE(8, 10);
  head.writeUInt16LE(entry.stamp.time, 12);
  head.writeUInt16LE(entry.stamp.date, 14);
  head.writeUInt32LE(entry.crc, 16);
  head.writeUInt32LE(entry.compressed, 20);
  head.writeUInt32LE(entry.size, 24);
  head.writeUInt16LE(entry.name.length, 28);
  head.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // a regular file, rw-r--r--
  head.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([head, entry.name]);
}

interface Entry {
  name: string;
  /** A file on disk, or the bytes. */
  path?: string;
  bytes?: Buffer;
  /** Compression level (1 for media, which is mostly compressed already). */
  level?: number;
}

/**
 * Writes the entries as a zip. The files are read once: their size and sha256 are collected as they pass
 * (`onFile`), so the manifest can be the last entry.
 */
async function* zipChunks(entries: readonly Entry[], manifestAfter: () => Entry, onFile: (name: string, size: number, sha256: string) => void, now: Date): AsyncGenerator<Buffer> {
  const written: Written[] = [];
  let offset = 0;
  const stamp = dosTime(now);
  const emit = (chunk: Buffer): Buffer => {
    offset += chunk.length;
    return chunk;
  };
  const one = async function* (entry: Entry, collect: boolean): AsyncGenerator<Buffer> {
    const name = Buffer.from(entry.name, 'utf8');
    const record: Written = { name, crc: 0, compressed: 0, size: 0, offset, stamp };
    yield emit(localHeader(name, stamp));
    const hash = createHash('sha256');
    let crc = 0;
    const tap = new Transform({
      transform(chunk: Buffer, _encoding, done: TransformCallback): void {
        crc = crc32(chunk, crc);
        hash.update(chunk);
        record.size += chunk.length;
        if (record.size > SNAPSHOT_LIMITS.maxFileBytes) return done(new DefinitionError(`${entry.name} is larger than 4 GB, which snapshots do not support.`));
        done(null, chunk);
      },
    });
    const source = entry.bytes !== undefined ? Readable.from([entry.bytes]) : createReadStream(entry.path ?? '');
    const deflate = createDeflateRaw({ level: entry.level ?? zlibConstants.Z_DEFAULT_COMPRESSION });
    const done = pipeline(source, tap, deflate);
    done.catch(() => undefined); // the error also reaches the loop below, through the destroyed stream
    for await (const chunk of deflate) {
      record.compressed += (chunk as Buffer).length;
      if (record.compressed > SNAPSHOT_LIMITS.maxFileBytes) throw new DefinitionError(`${entry.name} is larger than 4 GB, which snapshots do not support.`);
      yield emit(chunk as Buffer);
    }
    await done;
    record.crc = crc;
    yield emit(descriptor(record));
    written.push(record);
    if (collect) onFile(entry.name, record.size, hash.digest('hex'));
  };
  for (const entry of entries) yield* one(entry, true);
  yield* one(manifestAfter(), false);
  if (written.length > 65_534) throw new DefinitionError('Too many files for a snapshot (more than 65534).');
  const start = offset;
  for (const record of written) yield emit(centralRecord(record));
  const size = offset - start;
  if (offset > 0xfffffff0) throw new DefinitionError('The snapshot is larger than 4 GB, which snapshots do not support.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(written.length, 8);
  end.writeUInt16LE(written.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(start, 16);
  yield end;
}

export interface ExportSource {
  /** The backend folder. */
  dir: string;
  /** A running engine's database, so the copy is taken through its own connection. Otherwise the file is opened. */
  db?: DatabaseSync;
  /** Overrides the clock (tests). */
  now?: () => Date;
}

/**
 * The snapshot of a backend folder as a readable zip stream. Holds `backend.json`, `handlers/`, `seed/`,
 * `data/db.sqlite` (a consistent copy, sessions removed), `media/` and `manifest.json`. `.data/secrets.json`
 * and `.data/certs/` are never read. The temporary copy of the database is removed when the stream ends.
 */
export function snapshotStream(source: ExportSource): Readable {
  const root = resolve(source.dir);
  ensureRealDir(root, 'The backend folder', false);
  const now = (source.now ?? ((): Date => new Date()))();
  const dataDir = join(root, DATA_DIR);
  const staging = mkdtempSync(join(tmpdir(), 'tempo-snapshot-'));
  const cleanup = (): void => rmSync(staging, { recursive: true, force: true });
  try {
    const definition = join(root, DEFINITION_FILE);
    if (!lstatSync(definition).isFile()) throw new DefinitionError(`${DEFINITION_FILE} is not a file.`);
    const files: SourceFile[] = [{ name: DEFINITION_FILE, path: definition, size: lstatSync(definition).size }];
    const real = realpathSync(root);
    const inside = (path: string, label: string): string[] => (checkRoot(path, real, label) ? [path] : []);
    inside(dataDir, '.data');
    const handlers = inside(join(root, 'handlers'), 'handlers').flatMap((path) => walk(path, 'handlers'));
    const seeds = inside(join(root, 'seed'), 'seed').flatMap((path) => walk(path, 'seed'));
    files.push(...handlers, ...seeds);
    const dbSource = join(dataDir, 'db.sqlite');
    let hasDb = false;
    try {
      hasDb = statSync(dbSource).isFile() && !lstatSync(dbSource).isSymbolicLink();
    } catch {
      hasDb = false;
    }
    if (hasDb || source.db !== undefined) {
      const copy = join(staging, 'db.sqlite');
      copyDatabase(source.db ?? dbSource, copy);
      files.push({ name: 'data/db.sqlite', path: copy, size: statSync(copy).size });
    }
    const media = inside(join(dataDir, 'media'), '.data/media').flatMap((path) => walk(path, 'media', new Set(['.tmp'])));
    files.push(...media);
    if (files.length + 1 > SNAPSHOT_LIMITS.maxEntries) throw new DefinitionError('Too many files for a snapshot.');

    const counts = readCounts(files.find((file) => file.name === 'data/db.sqlite')?.path);
    const hashes: SnapshotManifest['files'] = [];
    const manifest = (): Entry => {
      const body: SnapshotManifest = {
        format: SNAPSHOT_FORMAT,
        engineVersion: pkg.version,
        createdAt: now.toISOString(),
        backend: backendName(definition),
        counts: { ...counts, collections: Object.keys(counts.rows).length, endpoints: endpointCount(definition), mediaFiles: media.length, handlers: handlers.length, seedFiles: seeds.length },
        excluded: [...SNAPSHOT_EXCLUDED],
        note: 'secrets.json and certs/ are not included. An imported backend gets a new JWT secret (so every access token stops working), no sign-in sessions, and needs new certificates.',
        files: hashes,
      };
      return { name: MANIFEST_FILE, bytes: Buffer.from(`${JSON.stringify(body, null, 2)}\n`) };
    };
    const entries: Entry[] = files.map((file) => ({ name: file.name, path: file.path, ...(file.name.startsWith('media/') ? { level: 1 } : {}) }));
    const chunks = zipChunks(entries, manifest, (name, size, sha256) => hashes.push({ path: name, size, sha256 }), now);
    const stream = Readable.from(chunks);
    stream.once('close', cleanup);
    return stream;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function backendName(definitionPath: string): string {
  try {
    const parsed: unknown = JSON.parse(readTextFile(definitionPath));
    return typeof parsed === 'object' && parsed !== null && typeof (parsed as { name?: unknown }).name === 'string' ? (parsed as { name: string }).name : 'backend';
  } catch {
    return 'backend';
  }
}

function endpointCount(definitionPath: string): number {
  try {
    const parsed: unknown = JSON.parse(readTextFile(definitionPath));
    const list = typeof parsed === 'object' && parsed !== null ? (parsed as { endpoints?: unknown }).endpoints : undefined;
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

function readTextFile(path: string): string {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(statSync(path).size, 16 * 1024 * 1024));
    readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Row counts of the user collections, and the number of app users, from the database copy. */
function readCounts(dbPath: string | undefined): Pick<SnapshotManifest['counts'], 'rows' | 'users'> & { rows: Record<string, number> } {
  const rows: Record<string, number> = {};
  if (dbPath === undefined) return { rows, users: 0 };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'").all();
    for (const table of tables) rows[String(table.name)] = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${String(table.name).replace(/"/g, '""')}"`).get()?.n ?? 0);
    const users = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE name = '_users'").get() === undefined ? 0 : Number(db.prepare('SELECT COUNT(*) AS n FROM _users').get()?.n ?? 0);
    return { rows, users };
  } finally {
    db.close();
  }
}

/** Writes the snapshot of a backend folder to a file. The file must not exist. */
export async function exportSnapshot(source: ExportSource, file: string): Promise<void> {
  const out = resolve(file);
  const stream = snapshotStream(source);
  await pipeline(stream, createWriteStream(out, { flags: 'wx', mode: 0o600 }));
}

// ---- the zip reader

interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  directory: boolean;
}

const refuse = (message: string): never => {
  throw new DefinitionError(`This is not a usable snapshot: ${message}`);
};

function readAt(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const read = readSync(fd, buffer, done, length - done, position + done);
    if (read === 0) return refuse('the file ends too early.');
    done += read;
  }
  return buffer;
}

const NAME_ROOTS = ['handlers/', 'seed/', 'media/'];

/** A name is accepted only when it is a relative path of plain segments inside a place a snapshot may write. */
export function checkEntryName(name: string): string | undefined {
  if (name === '' || name.length > 512) return 'an empty or too long name';
  if (name.includes('\0') || name.includes('\\') || /[\u0001-\u001f\u007f]/.test(name)) return 'a name with control characters or a backslash';
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return 'an absolute path';
  const segments = name.replace(/\/$/, '').split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return 'a path with ".." or empty parts';
  return undefined;
}

function allowed(name: string): boolean {
  return name === MANIFEST_FILE || name === DEFINITION_FILE || name === 'data/db.sqlite' || NAME_ROOTS.some((root) => name.startsWith(root) && name.length > root.length);
}

function readDirectory(fd: number, archiveSize: number, limits: Required<ImportLimits>): ZipEntry[] {
  if (archiveSize < 22) return refuse('it is too small to be a zip.');
  const tailSize = Math.min(archiveSize, 22 + 0xffff);
  const tail = readAt(fd, archiveSize - tailSize, tailSize);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
      at = i;
      break;
    }
  }
  if (at < 0) return refuse('no zip directory was found.');
  const count = tail.readUInt16LE(at + 10);
  const size = tail.readUInt32LE(at + 12);
  const start = tail.readUInt32LE(at + 16);
  if (tail.readUInt16LE(at + 4) !== 0 || tail.readUInt16LE(at + 6) !== 0) return refuse('multi-disk archives are not supported.');
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) return refuse('zip64 archives are not supported.');
  if (count !== tail.readUInt16LE(at + 8)) return refuse('the directory is inconsistent.');
  if (count > limits.maxEntries) return refuse(`it holds ${String(count)} files; the limit is ${String(limits.maxEntries)}.`);
  if (size > SNAPSHOT_LIMITS.maxDirectoryBytes || start + size > archiveSize) return refuse('the directory is damaged.');
  const directory = readAt(fd, start, size);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > directory.length || directory.readUInt32LE(p) !== 0x02014b50) return refuse('the directory is damaged.');
    const madeBy = directory.readUInt16LE(p + 4);
    const flags = directory.readUInt16LE(p + 8);
    const nameLength = directory.readUInt16LE(p + 28);
    const extraLength = directory.readUInt16LE(p + 30);
    const commentLength = directory.readUInt16LE(p + 32);
    const external = directory.readUInt32LE(p + 38);
    if (p + 46 + nameLength + extraLength + commentLength > directory.length) return refuse('the directory is damaged.');
    if ((flags & 0x1) !== 0 || (flags & 0x40) !== 0) return refuse('encrypted entries are not supported.');
    let name: string;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(directory.subarray(p + 46, p + 46 + nameLength));
    } catch {
      return refuse('a file name is not valid UTF-8.');
    }
    const problem = checkEntryName(name);
    if (problem !== undefined) return refuse(`${JSON.stringify(name).slice(0, 80)} is ${problem}.`);
    // Unix file type in the high bits of the external attributes: only regular files (and folders) may come in.
    if (madeBy >> 8 === 3) {
      const type = (external >>> 16) & 0o170000;
      if (type === 0o120000) return refuse(`${JSON.stringify(name)} is a symbolic link.`);
      if (type !== 0 && type !== 0o100000 && type !== 0o040000) return refuse(`${JSON.stringify(name)} is not a regular file.`);
    }
    const entry: ZipEntry = {
      name,
      method: directory.readUInt16LE(p + 10),
      crc: directory.readUInt32LE(p + 16),
      compressed: directory.readUInt32LE(p + 20),
      size: directory.readUInt32LE(p + 24),
      offset: directory.readUInt32LE(p + 42),
      directory: name.endsWith('/'),
    };
    if (entry.compressed === 0xffffffff || entry.size === 0xffffffff || entry.offset === 0xffffffff) return refuse('zip64 entries are not supported.');
    if (entry.method !== 0 && entry.method !== 8) return refuse(`${JSON.stringify(name)} uses compression method ${String(entry.method)}; only stored and deflate are supported.`);
    entries.push(entry);
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Streams the bytes of one entry (inflated), refusing to produce more than it declared. */
function entryStream(fd: number, path: string, entry: ZipEntry, budget: { left: number }): Readable {
  const local = readAt(fd, entry.offset, 30);
  if (local.readUInt32LE(0) !== 0x04034b50) return refuse(`${JSON.stringify(entry.name)} has a damaged header.`);
  const dataStart = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  if (entry.compressed === 0) return Readable.from([]);
  const source = createReadStream(path, { start: dataStart, end: dataStart + entry.compressed - 1 });
  let produced = 0;
  const guard = new Transform({
    transform(chunk: Buffer, _encoding, done: TransformCallback): void {
      budget.left -= chunk.length;
      produced += chunk.length;
      if (produced > entry.size || budget.left < 0) return done(new DefinitionError(`${JSON.stringify(entry.name)} inflates to more than it declared (or the snapshot is over the size limit).`));
      done(null, chunk);
    },
  });
  const body = entry.method === 8 ? createInflateRaw() : new PassThrough();
  void pipeline(source, body, guard).catch((error: unknown) => guard.destroy(error instanceof Error ? error : new Error(String(error))));
  return guard;
}

async function sinkEntry(stream: Readable, entry: ZipEntry, target: Transform | ReturnType<typeof createWriteStream> | undefined): Promise<{ sha256: string }> {
  const hash = createHash('sha256');
  let crc = 0;
  let size = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _encoding, done: TransformCallback): void {
      crc = crc32(chunk, crc);
      size += chunk.length;
      hash.update(chunk);
      done(null, chunk);
    },
  });
  if (target === undefined) {
    const collect = new PassThrough();
    collect.resume();
    await pipeline(stream, tap, collect);
  } else {
    await pipeline(stream, tap, target as NodeJS.WritableStream);
  }
  if (size !== entry.size) return refuse(`${JSON.stringify(entry.name)} has the wrong size.`);
  if (crc !== entry.crc) return refuse(`${JSON.stringify(entry.name)} is damaged (checksum).`);
  return { sha256: hash.digest('hex') };
}

export interface ImportResult {
  dir: string;
  manifest: SnapshotManifest;
  files: number;
}

/**
 * Imports a snapshot into a new or empty folder (a folder with anything in it, dot files included, is
 * refused). Everything is checked before anything is written: names (no absolute paths, `..`, links,
 * duplicates, places outside `backend.json`, `handlers/`, `seed/`, `data/db.sqlite`, `media/`), the entry
 * count, the total size, and then each file's size, checksum and the manifest's sha256. On any failure what was
 * written is removed. The backend gets a new JWT secret when it is first served, and the sessions are cleared.
 */
export async function importSnapshot(zipFile: string, dir: string, limits: ImportLimits = {}): Promise<ImportResult> {
  const cap: Required<ImportLimits> = { maxEntries: limits.maxEntries ?? SNAPSHOT_LIMITS.maxEntries, maxTotalBytes: limits.maxTotalBytes ?? SNAPSHOT_LIMITS.maxTotalBytes };
  const archive = resolve(zipFile);
  const root = resolve(dir);
  const archiveStat = lstatSync(archive, { throwIfNoEntry: false });
  if (archiveStat === undefined || !archiveStat.isFile()) throw new DefinitionError(`Snapshot file not found: ${archive}`);

  const existing = lstatSync(root, { throwIfNoEntry: false });
  if (existing !== undefined) {
    if (existing.isSymbolicLink()) throw new DefinitionError(`The target is a symbolic link and is not used: ${root}`);
    if (!existing.isDirectory()) throw new DefinitionError(`The target is not a folder: ${root}`);
    if (readdirSync(root).length > 0) throw new DefinitionError(`The target folder is not empty: ${root}. Import into a new or empty folder.`);
  }

  const fd = openSync(archive, 'r');
  try {
    const entries = readDirectory(fd, archiveStat.size, cap);
    const seen = new Set<string>();
    let declared = 0;
    let compressed = 0;
    for (const entry of entries) {
      const key = entry.name.normalize('NFC').toLowerCase();
      if (seen.has(key)) return refuse(`${JSON.stringify(entry.name)} appears twice.`);
      seen.add(key);
      if (entry.directory) {
        if (entry.size !== 0) return refuse('a folder entry holds data.');
        continue;
      }
      if (!allowed(entry.name)) return refuse(`${JSON.stringify(entry.name)} is not a place a snapshot writes to.`);
      declared += entry.size;
      compressed += entry.compressed;
      if (declared > cap.maxTotalBytes) return refuse(`it holds more than ${String(cap.maxTotalBytes)} bytes once unpacked.`);
      if (entry.offset + 30 + entry.compressed > archiveStat.size) return refuse(`${JSON.stringify(entry.name)} reaches past the end of the file.`);
    }
    // Entries that overlap each other (a zip bomb trick) claim more compressed bytes than the file holds.
    if (compressed > archiveStat.size) return refuse('its entries overlap.');
    const files = entries.filter((entry) => !entry.directory);
    const manifestEntry = files.find((entry) => entry.name === MANIFEST_FILE);
    if (manifestEntry === undefined) return refuse(`${MANIFEST_FILE} is missing.`);
    if (manifestEntry.size > SNAPSHOT_LIMITS.maxManifestBytes) return refuse(`${MANIFEST_FILE} is too large.`);

    const budget = { left: cap.maxTotalBytes };
    const chunks: Buffer[] = [];
    const manifestSink = new Transform({
      transform(chunk: Buffer, _encoding, done: TransformCallback): void {
        chunks.push(chunk);
        done();
      },
    });
    await sinkEntry(entryStream(fd, archive, manifestEntry, budget), manifestEntry, manifestSink);
    let manifest: SnapshotManifest;
    try {
      manifest = ManifestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      return refuse(`${MANIFEST_FILE} is not valid.`);
    }
    const listed = new Map(manifest.files.map((file) => [file.path, file]));
    if (listed.size !== manifest.files.length) return refuse(`${MANIFEST_FILE} lists a file twice.`);
    const content = files.filter((entry) => entry !== manifestEntry);
    if (content.length !== listed.size || content.some((entry) => !listed.has(entry.name))) return refuse(`the files do not match ${MANIFEST_FILE}.`);
    if (!content.some((entry) => entry.name === DEFINITION_FILE)) return refuse(`${DEFINITION_FILE} is missing.`);

    mkdirSync(root, { recursive: true, mode: 0o700 });
    ensureRealDir(root, 'The target folder', false);
    const dataDir = prepareDataDir(root);
    const place = (name: string): string => (name === 'data/db.sqlite' ? join(dataDir, 'db.sqlite') : name.startsWith('media/') ? join(dataDir, name) : join(root, name));
    for (const entry of content) {
      const target = place(entry.name);
      // Each parent folder is made one level at a time as a real folder, never through a link.
      const base = entry.name.startsWith('media/') ? dataDir : root;
      const relative = (target.slice(base.length + 1)).split('/');
      let at = base;
      for (const part of relative.slice(0, -1)) {
        at = join(at, part);
        ensureRealDir(at, part, true);
      }
      const expected = listed.get(entry.name);
      const out = createWriteStream(target, { flags: 'wx', mode: 0o600 });
      const { sha256 } = await sinkEntry(entryStream(fd, archive, entry, budget), entry, out);
      if (expected === undefined || expected.size !== entry.size || expected.sha256 !== sha256) return refuse(`${JSON.stringify(entry.name)} does not match ${MANIFEST_FILE}.`);
    }
    const copy = join(dataDir, 'db.sqlite');
    if (lstatSync(copy, { throwIfNoEntry: false }) !== undefined) {
      const db = new DatabaseSync(copy);
      try {
        const check = db.prepare('PRAGMA quick_check').get();
        if (String(Object.values(check ?? {})[0]) !== 'ok') return refuse('the database file is damaged.');
      } finally {
        db.close();
      }
      scrubSessions(copy);
    }
    return { dir: root, manifest, files: content.length };
  } catch (error) {
    for (const path of [join(root, DEFINITION_FILE), join(root, 'handlers'), join(root, 'seed'), join(root, DATA_DIR)]) rmSync(path, { recursive: true, force: true });
    throw error;
  } finally {
    closeSync(fd);
  }
}
