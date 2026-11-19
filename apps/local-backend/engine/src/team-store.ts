import { chmodSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { join } from 'node:path';

import type { Actor, AuditEntry, AuditFilter } from './audit.ts';
import { DefinitionError } from './schema.ts';
import type { ApiKeyScope, MemberRole } from './roles.ts';

export const SERVER_DB_FILE = 'server.sqlite';

export interface AccountRow {
  id: number;
  email: string;
  name: string;
  passwordHash: string | null;
  /** Encrypted (see `team-secret.ts`); `null` when TOTP is off. */
  totpSecret: string | null;
  /** A secret being set up, not active until a code from it is confirmed. */
  totpPending: string | null;
  /** The last time step a code was accepted for, so one code cannot be used twice. */
  totpLastStep: number;
  owner: boolean;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface MembershipRow {
  accountId: number;
  backendId: string;
  role: MemberRole;
}

export interface ApiKeyRow {
  id: number;
  backendId: string;
  name: string;
  scope: ApiKeyScope;
  prefix: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const toAccount = (row: Record<string, unknown>): AccountRow => ({
  id: Number(row.id),
  email: String(row.email),
  name: String(row.name),
  passwordHash: row.passwordHash === null ? null : String(row.passwordHash),
  totpSecret: row.totpSecret === null ? null : String(row.totpSecret),
  totpPending: row.totpPending === null ? null : String(row.totpPending),
  totpLastStep: Number(row.totpLastStep),
  owner: Number(row.owner) === 1,
  disabled: Number(row.disabled) === 1,
  createdAt: String(row.createdAt),
  lastLoginAt: row.lastLoginAt === null ? null : String(row.lastLoginAt),
});

const toKey = (row: Record<string, unknown>): ApiKeyRow => ({
  id: Number(row.id),
  backendId: String(row.backendId),
  name: String(row.name),
  scope: String(row.scope) as ApiKeyScope,
  prefix: String(row.prefix),
  createdBy: String(row.createdBy),
  createdAt: String(row.createdAt),
  lastUsedAt: row.lastUsedAt === null ? null : String(row.lastUsedAt),
  revokedAt: row.revokedAt === null ? null : String(row.revokedAt),
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    passwordHash TEXT,
    totpSecret TEXT,
    totpPending TEXT,
    totpLastStep INTEGER NOT NULL DEFAULT 0,
    owner INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    lastLoginAt TEXT
  );
  CREATE TABLE IF NOT EXISTS memberships (
    accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    backendId TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    PRIMARY KEY (accountId, backendId)
  );
  CREATE TABLE IF NOT EXISTS recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    codeHash TEXT NOT NULL,
    usedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS recovery_codes_account ON recovery_codes (accountId);
  CREATE TABLE IF NOT EXISTS setup_tokens (
    hash TEXT PRIMARY KEY,
    accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expiresAt TEXT NOT NULL,
    usedAt TEXT
  );
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backendId TEXT NOT NULL,
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    prefix TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    createdBy TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    lastUsedAt TEXT,
    revokedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS api_keys_backend ON api_keys (backendId);
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actorKind TEXT NOT NULL,
    actorId TEXT NOT NULL,
    actorLabel TEXT NOT NULL,
    backendId TEXT,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    status INTEGER NOT NULL,
    denied INTEGER NOT NULL DEFAULT 0,
    summary TEXT
  );
  CREATE INDEX IF NOT EXISTS audit_at ON audit (at);
  CREATE INDEX IF NOT EXISTS audit_backend ON audit (backendId, at);
  CREATE TABLE IF NOT EXISTS login_failures (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    lockedUntil INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL
  );
`;

/**
 * `server.sqlite`: the team server's own database, separate from every backend's. Accounts, memberships, recovery
 * codes, setup links, API keys, the audit log and the login lockout counters. Every statement is fixed text with
 * bound parameters. Secrets are stored as hashes (setup tokens, API keys, recovery codes) or encrypted (TOTP).
 */
export class TeamStore {
  readonly db: DatabaseSync;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (lstatSync(dir).isSymbolicLink()) throw new DefinitionError(`The data directory is a symbolic link and is not used: ${dir}`);
    const path = join(dir, SERVER_DB_FILE);
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new DefinitionError(`${SERVER_DB_FILE} is a symbolic link and is not used.`);
    this.db = new DatabaseSync(path);
    try {
      chmodSync(path, 0o600);
    } catch {
      // A file system without modes (some bind mounts): the folder itself is 0700.
    }
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  private one(sql: string, ...params: SQLInputValue[]): Record<string, unknown> | undefined {
    return this.db.prepare(sql).get(...params);
  }

  private run(sql: string, ...params: SQLInputValue[]): { changes: number; id: number } {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes), id: Number(result.lastInsertRowid) };
  }

  // ---- accounts

  accountById(id: number): AccountRow | undefined {
    const row = this.one('SELECT * FROM accounts WHERE id = ?', id);
    return row === undefined ? undefined : toAccount(row);
  }

  accountByEmail(email: string): AccountRow | undefined {
    const row = this.one('SELECT * FROM accounts WHERE email = ?', email);
    return row === undefined ? undefined : toAccount(row);
  }

  hasOwner(): boolean {
    return this.one('SELECT 1 AS found FROM accounts WHERE owner = 1') !== undefined;
  }

  listAccounts(): AccountRow[] {
    return this.db.prepare('SELECT * FROM accounts ORDER BY id').all().map(toAccount);
  }

  insertAccount(input: { email: string; name: string; passwordHash: string | null; owner: boolean; now: string }): AccountRow {
    const { id } = this.run('INSERT INTO accounts (email, name, passwordHash, owner, createdAt) VALUES (?, ?, ?, ?, ?)', input.email, input.name, input.passwordHash, input.owner ? 1 : 0, input.now);
    const created = this.accountById(id);
    if (created === undefined) throw new Error('The account was not saved.');
    return created;
  }

  setPassword(id: number, passwordHash: string): void {
    this.run('UPDATE accounts SET passwordHash = ? WHERE id = ?', passwordHash, id);
  }

  setName(id: number, name: string): void {
    this.run('UPDATE accounts SET name = ? WHERE id = ?', name, id);
  }

  setDisabled(id: number, disabled: boolean): void {
    this.run('UPDATE accounts SET disabled = ? WHERE id = ?', disabled ? 1 : 0, id);
  }

  setLastLogin(id: number, now: string): void {
    this.run('UPDATE accounts SET lastLoginAt = ? WHERE id = ?', now, id);
  }

  setTotpPending(id: number, value: string | null): void {
    this.run('UPDATE accounts SET totpPending = ? WHERE id = ?', value, id);
  }

  setTotpLastStep(id: number, step: number): void {
    this.run('UPDATE accounts SET totpLastStep = ? WHERE id = ?', step, id);
  }

  /** Turns TOTP on with the (encrypted) secret and clears the pending one. */
  enableTotp(id: number, secret: string, step: number): void {
    this.run('UPDATE accounts SET totpSecret = ?, totpPending = NULL, totpLastStep = ? WHERE id = ?', secret, step, id);
  }

  /** Turns TOTP off and drops the recovery codes. */
  clearTotp(id: number): void {
    this.run('UPDATE accounts SET totpSecret = NULL, totpPending = NULL, totpLastStep = 0 WHERE id = ?', id);
    this.run('DELETE FROM recovery_codes WHERE accountId = ?', id);
  }

  deleteAccount(id: number): void {
    this.run('DELETE FROM accounts WHERE id = ?', id);
  }

  // ---- memberships

  memberships(accountId: number): MembershipRow[] {
    return this.db
      .prepare('SELECT accountId, backendId, role FROM memberships WHERE accountId = ? ORDER BY backendId')
      .all(accountId)
      .map((row) => ({ accountId: Number(row.accountId), backendId: String(row.backendId), role: String(row.role) as MemberRole }));
  }

  membersOf(backendId: string): MembershipRow[] {
    return this.db
      .prepare('SELECT accountId, backendId, role FROM memberships WHERE backendId = ? ORDER BY accountId')
      .all(backendId)
      .map((row) => ({ accountId: Number(row.accountId), backendId: String(row.backendId), role: String(row.role) as MemberRole }));
  }

  membership(accountId: number, backendId: string): MembershipRow | undefined {
    const row = this.one('SELECT accountId, backendId, role FROM memberships WHERE accountId = ? AND backendId = ?', accountId, backendId);
    return row === undefined ? undefined : { accountId: Number(row.accountId), backendId: String(row.backendId), role: String(row.role) as MemberRole };
  }

  setMembership(accountId: number, backendId: string, role: MemberRole): void {
    this.run('INSERT INTO memberships (accountId, backendId, role) VALUES (?, ?, ?) ON CONFLICT(accountId, backendId) DO UPDATE SET role = excluded.role', accountId, backendId, role);
  }

  removeMembership(accountId: number, backendId: string): boolean {
    return this.run('DELETE FROM memberships WHERE accountId = ? AND backendId = ?', accountId, backendId).changes > 0;
  }

  /** A backend was deleted from the server: its members, keys and setup of access go with it. */
  dropBackend(backendId: string): void {
    this.run('DELETE FROM memberships WHERE backendId = ?', backendId);
    this.run('DELETE FROM api_keys WHERE backendId = ?', backendId);
  }

  // ---- recovery codes and setup links

  replaceRecoveryCodes(accountId: number, hashes: string[]): void {
    this.run('DELETE FROM recovery_codes WHERE accountId = ?', accountId);
    for (const hash of hashes) this.run('INSERT INTO recovery_codes (accountId, codeHash) VALUES (?, ?)', accountId, hash);
  }

  /** Marks the matching unused code as used. True when there was one (single use). */
  useRecoveryCode(accountId: number, hash: string, now: string): boolean {
    return this.run('UPDATE recovery_codes SET usedAt = ? WHERE accountId = ? AND codeHash = ? AND usedAt IS NULL', now, accountId, hash).changes > 0;
  }

  unusedRecoveryCodes(accountId: number): number {
    return Number(this.one('SELECT COUNT(*) AS n FROM recovery_codes WHERE accountId = ? AND usedAt IS NULL', accountId)?.n ?? 0);
  }

  insertSetupToken(hash: string, accountId: number, expiresAt: string): void {
    // A new link replaces the open ones of the same account.
    this.run('DELETE FROM setup_tokens WHERE accountId = ? AND usedAt IS NULL', accountId);
    this.run('INSERT INTO setup_tokens (hash, accountId, expiresAt) VALUES (?, ?, ?)', hash, accountId, expiresAt);
  }

  /** Uses a setup link up: the account id when the link exists, is unused and has not expired. */
  consumeSetupToken(hash: string, now: string): number | undefined {
    const row = this.one('SELECT accountId FROM setup_tokens WHERE hash = ? AND usedAt IS NULL AND expiresAt > ?', hash, now);
    if (row === undefined) return undefined;
    return this.run('UPDATE setup_tokens SET usedAt = ? WHERE hash = ? AND usedAt IS NULL', now, hash).changes > 0 ? Number(row.accountId) : undefined;
  }

  hasOpenSetupToken(accountId: number, now: string): boolean {
    return this.one('SELECT 1 AS found FROM setup_tokens WHERE accountId = ? AND usedAt IS NULL AND expiresAt > ?', accountId, now) !== undefined;
  }

  // ---- api keys

  insertKey(input: { backendId: string; name: string; scope: ApiKeyScope; prefix: string; hash: string; createdBy: string; now: string }): ApiKeyRow {
    const { id } = this.run('INSERT INTO api_keys (backendId, name, scope, prefix, hash, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', input.backendId, input.name, input.scope, input.prefix, input.hash, input.createdBy, input.now);
    const row = this.one('SELECT id, backendId, name, scope, prefix, createdBy, createdAt, lastUsedAt, revokedAt FROM api_keys WHERE id = ?', id);
    if (row === undefined) throw new Error('The key was not saved.');
    return toKey(row);
  }

  keyByHash(hash: string): ApiKeyRow | undefined {
    const row = this.one('SELECT id, backendId, name, scope, prefix, createdBy, createdAt, lastUsedAt, revokedAt FROM api_keys WHERE hash = ?', hash);
    return row === undefined ? undefined : toKey(row);
  }

  keysOf(backendId: string): ApiKeyRow[] {
    return this.db.prepare('SELECT id, backendId, name, scope, prefix, createdBy, createdAt, lastUsedAt, revokedAt FROM api_keys WHERE backendId = ? ORDER BY id').all(backendId).map(toKey);
  }

  keyById(id: number): ApiKeyRow | undefined {
    const row = this.one('SELECT id, backendId, name, scope, prefix, createdBy, createdAt, lastUsedAt, revokedAt FROM api_keys WHERE id = ?', id);
    return row === undefined ? undefined : toKey(row);
  }

  revokeKey(id: number, now: string): boolean {
    return this.run('UPDATE api_keys SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL', now, id).changes > 0;
  }

  touchKey(id: number, now: string): void {
    this.run('UPDATE api_keys SET lastUsedAt = ? WHERE id = ?', now, id);
  }

  // ---- login failures

  failures(key: string): { count: number; lockedUntil: number; updatedAt: number } | undefined {
    const row = this.one('SELECT count, lockedUntil, updatedAt FROM login_failures WHERE key = ?', key);
    return row === undefined ? undefined : { count: Number(row.count), lockedUntil: Number(row.lockedUntil), updatedAt: Number(row.updatedAt) };
  }

  saveFailures(key: string, count: number, lockedUntil: number, nowMs: number): void {
    this.run('INSERT INTO login_failures (key, count, lockedUntil, updatedAt) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = excluded.count, lockedUntil = excluded.lockedUntil, updatedAt = excluded.updatedAt', key, count, lockedUntil, nowMs);
  }

  clearFailures(key: string): void {
    this.run('DELETE FROM login_failures WHERE key = ?', key);
  }

  pruneFailures(olderThanMs: number): void {
    this.run('DELETE FROM login_failures WHERE updatedAt < ? AND lockedUntil < ?', olderThanMs, olderThanMs);
  }

  // ---- audit

  insertAudit(entry: { at: string; actor: Actor; backend: string | null; action: string; target: string; status: number; denied: boolean; summary: string | null }): void {
    this.run('INSERT INTO audit (at, actorKind, actorId, actorLabel, backendId, action, target, status, denied, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', entry.at, entry.actor.kind, entry.actor.id, entry.actor.label, entry.backend, entry.action, entry.target, entry.status, entry.denied ? 1 : 0, entry.summary);
  }

  queryAudit(filter: AuditFilter): { entries: AuditEntry[]; total: number } {
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.backend !== undefined) (where.push('backendId = ?'), params.push(filter.backend));
    if (filter.actor !== undefined) (where.push('actorLabel LIKE ? ESCAPE \'\\\''), params.push(`%${filter.actor.replace(/[\\%_]/g, '\\$&')}%`));
    if (filter.action !== undefined) (where.push('action LIKE ? ESCAPE \'\\\''), params.push(`%${filter.action.replace(/[\\%_]/g, '\\$&')}%`));
    if (filter.since !== undefined) (where.push('at >= ?'), params.push(filter.since));
    if (filter.until !== undefined) (where.push('at <= ?'), params.push(filter.until));
    const clause = where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`;
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const total = Number(this.one(`SELECT COUNT(*) AS n FROM audit ${clause}`, ...params)?.n ?? 0);
    const rows = this.db.prepare(`SELECT * FROM audit ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, Math.max(filter.skip ?? 0, 0));
    const entries = rows.map((row): AuditEntry => {
      let summary: AuditEntry['summary'] = null;
      try {
        summary = row.summary === null ? null : (JSON.parse(String(row.summary)) as AuditEntry['summary']);
      } catch {
        summary = null;
      }
      return {
        id: Number(row.id),
        at: String(row.at),
        actor: { kind: String(row.actorKind) as Actor['kind'], id: String(row.actorId), label: String(row.actorLabel) },
        backend: row.backendId === null ? null : String(row.backendId),
        action: String(row.action),
        target: String(row.target),
        status: Number(row.status),
        denied: Number(row.denied) === 1,
        summary,
      };
    });
    return { entries, total };
  }

  pruneAudit(before: string): number {
    return this.run('DELETE FROM audit WHERE at < ?', before).changes;
  }
}
