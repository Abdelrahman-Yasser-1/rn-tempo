import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { DATA_DIR, DEFINITION_FILE, ensureRealDir, prepareDataDir } from './folder.ts';
import { problemReply, type Reply } from './http.ts';
import { MEDIA_ID } from './media.ts';
import { quoteIdent } from './names.ts';
import { DefinitionError } from './schema.ts';
import { redactWebhookSecrets } from './webhooks.ts';
import { checkEntryName, checkRoot, walk } from './snapshot.ts';

/**
 * The test snapshot: what a Jest run (or a CI session) needs to start a copy of a backend, and nothing else.
 *
 * It is one JSON document, not the backup zip. The backup holds the whole SQLite file, which has the app users' password
 * hashes and sign-in sessions. A JSON dump of the collections, content and media records leaves those tables out by
 * construction (they are never read), the document is the same bytes for the same data (so its hash is a strong ETag), and
 * the test kit reads it with no zip or SQLite code.
 *
 * Never in it: `.data/secrets.json` (JWT secret), `.data/certs/`, `.data/logs/`, app users (`_users`), sign-in sessions
 * (`_refresh_tokens`), and everything of the team server (accounts, API keys, the audit log, its sessions).
 */
export const TEST_SNAPSHOT_FORMAT = 1;
export const TEST_SNAPSHOT_KIND = 'tempo-test-snapshot';
/** Always listed in the document, so a reader can see what was left out. */
export const TEST_SNAPSHOT_EXCLUDED = ['secrets.json', 'certs/', 'logs/', 'app users (_users)', 'sign-in sessions (_refresh_tokens)', 'webhook header values and address credentials', 'team accounts, API keys, audit log and sessions'] as const;

export const TEST_SNAPSHOT_LIMITS = {
  /** Media files that go in whole (bytes, together). A bigger one becomes a placeholder. */
  mediaBytes: 5 * 1024 * 1024,
  /** The whole document, as text. A backend that needs more is refused (413). */
  maxBytes: 32 * 1024 * 1024,
} as const;

/** The built-in tables a snapshot carries (their data is content and media records, not accounts). */
const CONTENT_TABLES = ['_content_entries', '_content_values', '_content_versions'] as const;
const MEDIA_TABLE = '_media';
const PLACEHOLDER_TEXT = 'This file was too large for the test snapshot. Tempo replaced it with this text.\n';

const Cell = z.union([z.string(), z.number(), z.null()]);
const SnapshotSchema = z.strictObject({
  kind: z.literal(TEST_SNAPSHOT_KIND),
  format: z.literal(TEST_SNAPSHOT_FORMAT),
  backend: z.string(),
  engineVersion: z.string(),
  excluded: z.array(z.string()),
  /** Ids of media files that are placeholders. */
  placeholders: z.array(z.string()),
  /** Rows by table: the collections, the content tables and `_media`. */
  tables: z.record(z.string(), z.array(z.record(z.string(), Cell))),
  files: z.array(z.strictObject({ path: z.string(), encoding: z.enum(['utf8', 'base64']), content: z.string(), size: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
});
export type TestSnapshot = z.infer<typeof SnapshotSchema>;

export class SnapshotTooLargeError extends Error {
  constructor(limit: number) {
    super(`The backend is larger than a test snapshot may be (${String(limit)} bytes). Remove data or media from it.`);
    this.name = 'SnapshotTooLargeError';
  }
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

function utf8Text(bytes: Buffer): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function fileEntry(path: string, bytes: Buffer): TestSnapshot['files'][number] {
  const text = utf8Text(bytes);
  return { path, encoding: text === undefined ? 'base64' : 'utf8', content: text ?? bytes.toString('base64'), size: bytes.length, sha256: sha256(bytes) };
}

function cell(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'bigint') return Number(value);
  return String(value);
}

function dumpTable(db: DatabaseSync, table: string, order: string, skip: ReadonlySet<string> = new Set()): Record<string, string | number | null>[] {
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([name]) => !skip.has(name)).map(([name, value]) => [name, cell(value)])));
}

export interface BuildOptions {
  /** The backend folder. */
  dir: string;
  /** The running engine's database (read in one go: nothing writes meanwhile). */
  db: DatabaseSync;
  /** The user collections to dump. */
  collections: readonly string[];
  /** Media bytes that go in whole (default 5 MB). */
  mediaBytes?: number;
  /** Largest document in bytes (default 32 MB). */
  maxBytes?: number;
}

/** Builds the snapshot of a backend. Throws SnapshotTooLargeError when it would not fit the cap. */
export function buildTestSnapshot(options: BuildOptions): TestSnapshot {
  const root = realpathSync(resolve(options.dir));
  const maxBytes = options.maxBytes ?? TEST_SNAPSHOT_LIMITS.maxBytes;
  let mediaLeft = options.mediaBytes ?? TEST_SNAPSHOT_LIMITS.mediaBytes;
  let total = 0;
  const add = (bytes: number): void => {
    total += bytes;
    if (total > maxBytes) throw new SnapshotTooLargeError(maxBytes);
  };
  const files: TestSnapshot['files'] = [];
  const definition = join(root, DEFINITION_FILE);
  if (!lstatSync(definition).isFile()) throw new DefinitionError(`${DEFINITION_FILE} is not a file.`);
  const read = (path: string, name: string): void => {
    const size = lstatSync(path).size;
    add(size);
    files.push(fileEntry(name, readFileSync(path)));
  };
  const definitionBytes = redactedDefinition(readFileSync(definition));
  add(definitionBytes.length);
  files.push(fileEntry(DEFINITION_FILE, definitionBytes));
  for (const folder of ['seed', 'handlers']) {
    if (!checkRoot(join(root, folder), root, folder)) continue;
    for (const file of walk(join(root, folder), folder)) read(file.path, file.name);
  }

  const tables: TestSnapshot['tables'] = {};
  for (const name of options.collections) tables[name] = dumpTable(options.db, quoteIdent(name), '"id"');
  tables._content_entries = dumpTable(options.db, '_content_entries', 'id');
  tables._content_values = dumpTable(options.db, '_content_values', 'entryId, locale');
  tables._content_versions = dumpTable(options.db, '_content_versions', 'id');

  // `uploadedBy` points at an app user, and app users are not in a snapshot.
  const media = dumpTable(options.db, MEDIA_TABLE, 'createdAt, id', new Set(['uploadedBy']));
  const placeholders: string[] = [];
  const mediaRoot = join(root, DATA_DIR, 'media');
  const hasMediaRoot = checkRoot(mediaRoot, root, '.data/media');
  const kept: typeof media = [];
  for (const record of media) {
    const id = String(record.id);
    if (!MEDIA_ID.test(id)) continue;
    const path = join(mediaRoot, id.slice(0, 2), id);
    let bytes: Buffer | undefined;
    const stat = hasMediaRoot ? lstatSync(path, { throwIfNoEntry: false }) : undefined;
    if (stat?.isFile() === true && stat.size <= mediaLeft) {
      bytes = readFileSync(path);
      mediaLeft -= bytes.length;
    }
    if (bytes === undefined) {
      bytes = Buffer.from(PLACEHOLDER_TEXT);
      placeholders.push(id);
      kept.push({ ...record, size: bytes.length, sha256: sha256(bytes) });
    } else kept.push(record);
    add(bytes.length * 2);
    files.push(fileEntry(`media/${id}`, bytes));
  }
  tables[MEDIA_TABLE] = kept;
  const snapshot: TestSnapshot = { kind: TEST_SNAPSHOT_KIND, format: TEST_SNAPSHOT_FORMAT, backend: readName(definition), engineVersion: pkg.version, excluded: [...TEST_SNAPSHOT_EXCLUDED], placeholders, tables, files };
  add(JSON.stringify(tables).length);
  return snapshot;
}

/**
 * `backend.json` for a snapshot. When it has webhooks, their header values and address credentials (a receiver's token,
 * a query secret) are hidden: a snapshot goes to read-only keys and into CI. Without webhooks the bytes are untouched.
 */
function redactedDefinition(bytes: Buffer): Buffer {
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { webhooks?: unknown }).webhooks) || (parsed as { webhooks: unknown[] }).webhooks.length === 0) return bytes;
    return Buffer.from(`${JSON.stringify(redactWebhookSecrets(parsed), null, 2)}\n`);
  } catch {
    return bytes;
  }
}

function readName(definitionPath: string): string {
  try {
    const parsed = JSON.parse(readFileSync(definitionPath, 'utf8')) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : 'backend';
  } catch {
    return 'backend';
  }
}

/** The text of the snapshot (the same bytes for the same data) and its strong ETag. */
export function encodeTestSnapshot(snapshot: TestSnapshot): { text: string; etag: string } {
  const text = JSON.stringify(snapshot);
  return { text, etag: `"${sha256(text)}"` };
}

/** True when an `If-None-Match` header names the ETag (or `*`). */
export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (value === undefined) return false;
  return value.split(',').some((part) => {
    const candidate = part.trim().replace(/^W\//, '');
    return candidate === '*' || candidate === etag;
  });
}

/** The answer of a snapshot route: 200 with the document, or 304 when the client holds the same one. */
export function testSnapshotReply(snapshot: () => TestSnapshot, ifNoneMatch: string | string[] | undefined): Reply {
  let built: TestSnapshot;
  try {
    built = snapshot();
  } catch (error) {
    if (error instanceof SnapshotTooLargeError) return problemReply(413, { detail: error.message });
    throw error;
  }
  const { text, etag } = encodeTestSnapshot(built);
  const headers = { etag, 'cache-control': 'private, no-cache', vary: 'authorization' };
  if (etagMatches(ifNoneMatch, etag)) return { status: 304, headers };
  return { status: 200, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' }, raw: text };
}

/** Parses and checks a downloaded snapshot: the shape, every file name, every hash and every media id. */
export function parseTestSnapshot(text: string): TestSnapshot {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DefinitionError('The test snapshot is not valid JSON.');
  }
  const parsed = SnapshotSchema.safeParse(json);
  if (!parsed.success) throw new DefinitionError('The test snapshot does not have the expected shape (is the server older than this test kit?).');
  const snapshot = parsed.data;
  const seen = new Set<string>();
  for (const file of snapshot.files) {
    const problem = checkEntryName(file.path);
    const allowed = file.path === DEFINITION_FILE || ((file.path.startsWith('seed/') || file.path.startsWith('handlers/')) && file.path.length > 5) || (file.path.startsWith('media/') && MEDIA_ID.test(file.path.slice(6)));
    if (problem !== undefined || !allowed) throw new DefinitionError(`The test snapshot names a file it may not write: ${JSON.stringify(file.path).slice(0, 80)}.`);
    if (seen.has(file.path)) throw new DefinitionError(`The test snapshot lists ${file.path} twice.`);
    seen.add(file.path);
    const bytes = file.encoding === 'utf8' ? Buffer.from(file.content, 'utf8') : Buffer.from(file.content, 'base64');
    if (bytes.length !== file.size || sha256(bytes) !== file.sha256) throw new DefinitionError(`${file.path} in the test snapshot is damaged (size or hash).`);
  }
  if (!seen.has(DEFINITION_FILE)) throw new DefinitionError(`The test snapshot has no ${DEFINITION_FILE}.`);
  return snapshot;
}

/** Writes the files of a snapshot into an empty backend folder: `backend.json`, `seed/`, `handlers/` and `.data/media/`. */
export function writeTestSnapshotFiles(snapshot: TestSnapshot, dir: string): void {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  ensureRealDir(root, 'The backend folder', false);
  const dataDir = prepareDataDir(root);
  for (const file of snapshot.files) {
    const target = file.path.startsWith('media/') ? join(dataDir, 'media', file.path.slice(6, 8), file.path.slice(6)) : join(root, file.path);
    const parent = dirname(target);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
    writeFileSync(target, file.encoding === 'utf8' ? file.content : Buffer.from(file.content, 'base64'), { flag: 'wx', mode: 0o600 });
  }
}

/**
 * Replaces the rows of the collections, the content tables and the media records with the snapshot's. Only tables that
 * exist are touched, and only columns they have. One transaction; foreign keys are off inside it because the tables
 * are emptied and refilled as a whole.
 */
export function loadTestSnapshotData(db: DatabaseSync, snapshot: TestSnapshot): void {
  const exists = (table: string): boolean => db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
  const fixed = new Set<string>([...CONTENT_TABLES, MEDIA_TABLE]);
  const user = Object.keys(snapshot.tables).filter((name) => !fixed.has(name) && !name.startsWith('_') && !name.toLowerCase().startsWith('sqlite_'));
  const order = [...user, '_content_entries', '_content_values', '_content_versions', MEDIA_TABLE];
  const ident = (table: string): string => (fixed.has(table) ? table : quoteIdent(table));
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of [...order].reverse()) if (exists(table)) db.exec(`DELETE FROM ${ident(table)}`);
    for (const table of order) {
      const rows = snapshot.tables[table];
      if (rows === undefined || !exists(table)) continue;
      const columns = new Set(db.prepare(`PRAGMA table_info(${ident(table)})`).all().map((column) => String(column.name)));
      for (const row of rows) {
        const names = Object.keys(row).filter((name) => columns.has(name) && /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(name));
        if (names.length === 0) continue;
        if (table === MEDIA_TABLE && !MEDIA_ID.test(String(row.id))) continue;
        const sql = `INSERT INTO ${ident(table)} (${names.map((name) => `"${name}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
        db.prepare(sql).run(...names.map((name): SQLInputValue => row[name] ?? null));
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/** A snapshot of a committed backend folder: `backend.json`, `seed/` and `handlers/`, with no data (the seed files fill the collections). */
export function snapshotOfFolder(dir: string): TestSnapshot {
  const root = realpathSync(resolve(dir));
  const definition = join(root, DEFINITION_FILE);
  if (lstatSync(definition, { throwIfNoEntry: false })?.isFile() !== true) throw new DefinitionError(`${DEFINITION_FILE} not found in ${root}.`);
  const files: TestSnapshot['files'] = [fileEntry(DEFINITION_FILE, readFileSync(definition))];
  for (const folder of ['seed', 'handlers']) {
    if (!checkRoot(join(root, folder), root, folder)) continue;
    for (const file of walk(join(root, folder), folder)) files.push(fileEntry(file.name, readFileSync(file.path)));
  }
  return { kind: TEST_SNAPSHOT_KIND, format: TEST_SNAPSHOT_FORMAT, backend: readName(definition), engineVersion: pkg.version, excluded: [...TEST_SNAPSHOT_EXCLUDED], placeholders: [], tables: {}, files };
}
