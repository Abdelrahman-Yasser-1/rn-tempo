import type { DatabaseSync } from 'node:sqlite';

import { isSensitiveKey, REDACTED } from './shared/redact.ts';

import { INBOX_MAX_BODY_BYTES } from './schema.ts';

/** Everything the inboxes of one backend keep together, whatever the number of endpoints. */
export const INBOX_TOTAL_BYTES = 64 * 1024 * 1024;

/** `****` and the last four characters, so a signature can be told apart from another without being usable. */
export function maskTail(value: string): string {
  return value.length <= 4 ? '****' : `****${value.slice(-4)}`;
}

const SIGNATURE_NAME = /signature/i;
/** Names that carry credentials or session identifiers. A signature is masked to its tail; everything else here is hidden. */
const CREDENTIAL_NAME = /auth|token|key|secret|session|cookie|signature|credential|password/i;

/** Whether a header or query parameter name looks like it holds a credential. */
export const looksSensitive = (name: string): boolean => CREDENTIAL_NAME.test(name) || isSensitiveKey(name);

/** Headers as stored: signature headers masked to their last four characters, every other credential-looking header replaced. */
export function maskHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(headers)) {
    if (raw === undefined) continue;
    const value = Array.isArray(raw) ? raw.join(', ') : raw;
    out[name] = SIGNATURE_NAME.test(name) ? maskTail(value) : looksSensitive(name) ? REDACTED : value;
  }
  return out;
}

/** A query string with the value of every credential-looking parameter replaced (`token=[REDACTED]`). */
export function maskQuery(query: string): string {
  if (query === '') return '';
  return [...new URLSearchParams(query)].map(([key, value]) => `${encodeURIComponent(key)}=${looksSensitive(key) ? REDACTED : encodeURIComponent(value)}`).join('&');
}

/** What the list shows: no headers, query or body. */
export interface InboxListItem {
  id: number;
  endpointId: string;
  at: string;
  method: string;
  path: string;
  size: number;
  /** The status the sender was answered with. */
  status: number;
}

export interface InboxSummary extends InboxListItem {
  query: string;
  headers: Record<string, string>;
}

export interface InboxEntry extends InboxSummary {
  /** The body as text when it is valid UTF-8, else base64. */
  body: string;
  encoding: 'utf8' | 'base64';
}

interface Row {
  id: number;
  endpoint_id: string;
  at: string;
  method: string;
  path: string;
  query: string;
  headers: string;
  size: number;
  status: number;
  body?: Uint8Array;
}

const itemOf = (row: Row): InboxListItem => ({ id: row.id, endpointId: row.endpoint_id, at: row.at, method: row.method, path: row.path, size: row.size, status: row.status });
const summaryOf = (row: Row): InboxSummary => ({ ...itemOf(row), query: row.query, headers: JSON.parse(row.headers) as Record<string, string> });

/**
 * The requests an `inbox` endpoint captured, in `_inbox`: the last N per endpoint (a ring), and a cap on the total size.
 * The body is kept as received (bytes), because a developer needs to see what a service sent. Only the editor role reads
 * it; the list and the logs show sizes only.
 */
export class Inbox {
  private readonly db: DatabaseSync;
  private readonly now: () => Date;

  constructor(db: DatabaseSync, now: () => Date) {
    this.db = db;
    this.now = now;
    db.exec(`CREATE TABLE IF NOT EXISTS _inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint_id TEXT NOT NULL, at TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL,
      query TEXT NOT NULL, headers TEXT NOT NULL, size INTEGER NOT NULL, status INTEGER NOT NULL DEFAULT 200, body BLOB NOT NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS _inbox_endpoint ON _inbox (endpoint_id, id)');
  }

  capture(input: { endpointId: string; method: string; path: string; query: string; headers: Record<string, string | string[] | undefined>; body: Uint8Array; keep: number; status: number }): InboxSummary {
    if (input.body.length > INBOX_MAX_BODY_BYTES) throw new RangeError('The body is larger than the inbox keeps.');
    const headers = JSON.stringify(maskHeaders(input.headers));
    const result = this.db
      .prepare('INSERT INTO _inbox (endpoint_id, at, method, path, query, headers, size, status, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(input.endpointId, this.now().toISOString(), input.method, input.path, maskQuery(input.query), headers, input.body.length, input.status, input.body);
    const id = Number(result.lastInsertRowid);
    // The ring: the oldest beyond `keep` go.
    this.db.prepare('DELETE FROM _inbox WHERE endpoint_id = ? AND id NOT IN (SELECT id FROM _inbox WHERE endpoint_id = ? ORDER BY id DESC LIMIT ?)').run(input.endpointId, input.endpointId, input.keep);
    // The total size cap: drop the oldest of everything until it fits (the newest request always stays).
    let total = Number(this.db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM _inbox').get()?.n ?? 0);
    while (total > INBOX_TOTAL_BYTES) {
      const oldest = this.db.prepare('SELECT id, size FROM _inbox WHERE id <> ? ORDER BY id LIMIT 1').get(id) as { id: number; size: number } | undefined;
      if (oldest === undefined) break;
      this.db.prepare('DELETE FROM _inbox WHERE id = ?').run(oldest.id);
      total -= oldest.size;
    }
    return this.summary(id) as InboxSummary;
  }

  summary(id: number): InboxSummary | undefined {
    const row = this.db.prepare('SELECT id, endpoint_id, at, method, path, query, headers, size, status FROM _inbox WHERE id = ?').get(id) as unknown as Row | undefined;
    return row === undefined ? undefined : summaryOf(row);
  }

  list(endpointId?: string, limit = 100): InboxListItem[] {
    const cap = Math.min(Math.max(limit, 1), 500);
    const rows = (endpointId === undefined
      ? this.db.prepare('SELECT id, endpoint_id, at, method, path, size, status FROM _inbox ORDER BY id DESC LIMIT ?').all(cap)
      : this.db.prepare('SELECT id, endpoint_id, at, method, path, size, status FROM _inbox WHERE endpoint_id = ? ORDER BY id DESC LIMIT ?').all(endpointId, cap)) as unknown as Row[];
    return rows.map(itemOf);
  }

  get(id: number): InboxEntry | undefined {
    const row = this.db.prepare('SELECT * FROM _inbox WHERE id = ?').get(id) as unknown as Row | undefined;
    if (row === undefined) return undefined;
    const bytes = Buffer.from(row.body ?? new Uint8Array());
    const text = bytes.toString('utf8');
    const utf8 = Buffer.from(text, 'utf8').equals(bytes);
    return { ...summaryOf(row), body: utf8 ? text : bytes.toString('base64'), encoding: utf8 ? 'utf8' : 'base64' };
  }

  clear(endpointId?: string): number {
    const result = endpointId === undefined ? this.db.prepare('DELETE FROM _inbox').run() : this.db.prepare('DELETE FROM _inbox WHERE endpoint_id = ?').run(endpointId);
    return Number(result.changes);
  }

  stats(): { count: number; bytes: number } {
    const row = this.db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(size), 0) AS b FROM _inbox').get();
    return { count: Number(row?.c ?? 0), bytes: Number(row?.b ?? 0) };
  }
}

const HOP = new Set(['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'expect']);

/** The headers worth sending again: not hop-by-hop, not a hidden credential, not a masked signature. */
export function replayHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) => !HOP.has(name.toLowerCase()) && value !== REDACTED && !value.startsWith('****') && !SIGNATURE_NAME.test(name)));
}

const shell = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

/** A `curl` command that repeats a captured request against `url` (credentials and signatures are not included). */
export function curlOf(entry: InboxEntry, url: string): string {
  const parts = ['curl', '-X', entry.method, shell(url)];
  for (const [name, value] of Object.entries(replayHeaders(entry.headers))) parts.push('-H', shell(`${name}: ${value}`));
  if (entry.size > 0) parts.push(entry.encoding === 'utf8' ? `--data-raw ${shell(entry.body)}` : `--data-binary @<(printf %s ${shell(entry.body)} | base64 -d)`);
  return parts.join(' ');
}
