import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { UniqueViolationError, uniqueViolation } from './store.ts';
import { randomToken, sha256Hex } from './tokens.ts';

/**
 * The built-in tables (`_users`, `_refresh_tokens`, `_media`). Names start with `_`, which no collection name
 * can (see `names.ts`), so they never clash with a user collection. Every statement here is fixed text with
 * bound parameters.
 */
export function migrateBuiltins(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT COLLATE NOCASE UNIQUE,
      passwordHash TEXT,
      firstName TEXT NOT NULL DEFAULT '',
      lastName TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      disabled INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      extra TEXT
    );
    CREATE TABLE IF NOT EXISTS _refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES _users(id) ON DELETE CASCADE,
      tokenHash TEXT NOT NULL UNIQUE,
      family TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      revokedAt TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS _refresh_tokens_family ON _refresh_tokens (family);
    CREATE INDEX IF NOT EXISTS _refresh_tokens_user ON _refresh_tokens (userId);
    CREATE TABLE IF NOT EXISTS _media (
      id TEXT PRIMARY KEY,
      originalName TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      uploadedBy INTEGER
    );
  `);
}

/** A stored user. `passwordHash` never leaves this module's callers: use `publicUser` / `adminUser`. */
export interface UserRecord {
  id: number;
  username: string;
  email: string | null;
  passwordHash: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  image: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  extra: Record<string, unknown>;
}

/** The signed-in user a request carries (`ctx.user`). */
export interface AuthUser {
  id: number;
  username: string;
}

/** Contract C13 `User`, plus any custom profile fields. Never holds the password hash. */
export function publicUser(user: UserRecord): Record<string, unknown> {
  return {
    ...user.extra,
    id: user.id,
    username: user.username,
    email: user.email ?? '',
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    image: user.image,
  };
}

/** What the admin API shows: the public fields plus account state. Still no password hash. */
export function adminUser(user: UserRecord): Record<string, unknown> {
  return { ...publicUser(user), disabled: user.disabled, hasPassword: user.passwordHash !== null, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

export interface NewUser {
  username: string;
  email?: string | null;
  passwordHash?: string | null;
  firstName?: string;
  lastName?: string;
  gender?: string;
  image?: string;
  extra?: Record<string, unknown>;
  disabled?: boolean;
}

export type UserPatch = Partial<Pick<NewUser, 'username' | 'email' | 'firstName' | 'lastName' | 'gender' | 'image'>> & { extra?: Record<string, unknown> };

function toUser(raw: Record<string, unknown>): UserRecord {
  let extra: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw.extra === null || raw.extra === undefined ? {} : JSON.parse(String(raw.extra));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) extra = parsed as Record<string, unknown>;
  } catch {
    // A damaged extra column reads as empty.
  }
  return {
    id: Number(raw.id),
    username: String(raw.username),
    email: raw.email === null ? null : String(raw.email),
    passwordHash: raw.passwordHash === null ? null : String(raw.passwordHash),
    firstName: String(raw.firstName),
    lastName: String(raw.lastName),
    gender: String(raw.gender),
    image: String(raw.image),
    disabled: Number(raw.disabled) === 1,
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt),
    extra,
  };
}

/** Keys of `extra` that would shadow a real field are dropped. */
function cleanExtra(extra: Record<string, unknown> | undefined): Record<string, unknown> {
  const reserved = new Set(['id', 'username', 'email', 'firstName', 'lastName', 'gender', 'image', 'password', 'passwordHash', 'disabled', 'accessToken', 'refreshToken']);
  return Object.fromEntries(Object.entries(extra ?? {}).filter(([key]) => !reserved.has(key)));
}

export interface SessionRow {
  id: number;
  userId: number;
  username: string;
  family: string;
  createdAt: string;
  expiresAt: string;
}

export type RotateResult = { ok: true; user: UserRecord; refreshToken: string } | { ok: false; reason: 'invalid' | 'reused' | 'expired' | 'disabled' };

/** App users and their refresh tokens. */
export class Accounts {
  private readonly db: DatabaseSync;
  private readonly now: () => Date;

  constructor(db: DatabaseSync, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  // ---- users

  create(input: NewUser): UserRecord {
    const stamp = this.stamp();
    try {
      const result = this.db
        .prepare(
          'INSERT INTO _users (username, email, passwordHash, firstName, lastName, gender, image, disabled, createdAt, updatedAt, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          input.username,
          input.email === undefined || input.email === '' ? null : input.email,
          input.passwordHash ?? null,
          input.firstName ?? '',
          input.lastName ?? '',
          input.gender ?? '',
          input.image ?? '',
          input.disabled === true ? 1 : 0,
          stamp,
          stamp,
          JSON.stringify(cleanExtra(input.extra)),
        );
      return this.byId(Number(result.lastInsertRowid)) as UserRecord;
    } catch (error) {
      throw uniqueViolation(error) ?? error;
    }
  }

  byId(id: number): UserRecord | undefined {
    const raw = this.db.prepare('SELECT * FROM _users WHERE id = ?').get(id);
    return raw === undefined ? undefined : toUser(raw);
  }

  /** Looks a user up by username or email (not case sensitive). */
  byLogin(login: string): UserRecord | undefined {
    const raw = this.db.prepare('SELECT * FROM _users WHERE username = ? OR email = ? ORDER BY username = ? DESC LIMIT 1').get(login, login, login);
    return raw === undefined ? undefined : toUser(raw);
  }

  hasUsername(username: string): boolean {
    return this.db.prepare('SELECT 1 AS found FROM _users WHERE username = ?').get(username) !== undefined;
  }

  list(options: { q?: string; skip?: number; limit?: number } = {}): { users: UserRecord[]; total: number } {
    const text = options.q === undefined || options.q === '' ? undefined : `%${options.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const where = text === undefined ? '' : " WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR firstName LIKE ? ESCAPE '\\' OR lastName LIKE ? ESCAPE '\\'";
    const params: SQLInputValue[] = text === undefined ? [] : [text, text, text, text];
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS n FROM _users${where}`).get(...params)?.n ?? 0);
    const rows = this.db.prepare(`SELECT * FROM _users${where} ORDER BY id LIMIT ? OFFSET ?`).all(...params, options.limit ?? 50, options.skip ?? 0);
    return { users: rows.map(toUser), total };
  }

  update(id: number, patch: UserPatch): UserRecord | undefined {
    const current = this.byId(id);
    if (current === undefined) return undefined;
    const next = {
      username: patch.username ?? current.username,
      email: patch.email === undefined ? current.email : patch.email === '' ? null : patch.email,
      firstName: patch.firstName ?? current.firstName,
      lastName: patch.lastName ?? current.lastName,
      gender: patch.gender ?? current.gender,
      image: patch.image ?? current.image,
      extra: patch.extra === undefined ? current.extra : { ...current.extra, ...cleanExtra(patch.extra) },
    };
    try {
      this.db
        .prepare('UPDATE _users SET username = ?, email = ?, firstName = ?, lastName = ?, gender = ?, image = ?, extra = ?, updatedAt = ? WHERE id = ?')
        .run(next.username, next.email, next.firstName, next.lastName, next.gender, next.image, JSON.stringify(next.extra), this.stamp(), id);
    } catch (error) {
      throw uniqueViolation(error) ?? error;
    }
    return this.byId(id);
  }

  setPasswordHash(id: number, passwordHash: string): boolean {
    return Number(this.db.prepare('UPDATE _users SET passwordHash = ?, updatedAt = ? WHERE id = ?').run(passwordHash, this.stamp(), id).changes) > 0;
  }

  setDisabled(id: number, disabled: boolean): boolean {
    return Number(this.db.prepare('UPDATE _users SET disabled = ?, updatedAt = ? WHERE id = ?').run(disabled ? 1 : 0, this.stamp(), id).changes) > 0;
  }

  remove(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM _users WHERE id = ?').run(id).changes) > 0;
  }

  /** Seeds a user unless the username is taken. Used at start-up. */
  seed(input: NewUser): boolean {
    if (this.hasUsername(input.username)) return false;
    try {
      this.create(input);
      return true;
    } catch (error) {
      if (error instanceof UniqueViolationError) return false;
      throw error;
    }
  }

  // ---- refresh tokens

  private insertToken(userId: number, family: string, ttlMs: number): string {
    const token = randomToken();
    const now = this.now();
    this.db
      .prepare('INSERT INTO _refresh_tokens (userId, tokenHash, family, expiresAt, revokedAt, createdAt) VALUES (?, ?, ?, ?, NULL, ?)')
      .run(userId, sha256Hex(token), family, new Date(now.getTime() + ttlMs).toISOString(), now.toISOString());
    return token;
  }

  /** Starts a new family of refresh tokens (a sign-in). */
  issueRefresh(userId: number, ttlMs: number): string {
    return this.insertToken(userId, randomToken(12), ttlMs);
  }

  /**
   * Trades a refresh token for a new one in the same family and revokes the old one. Using a token that was
   * already revoked means it leaked or was replayed, so the whole family is revoked (and the answer is 401).
   */
  rotate(token: string, ttlMs: number): RotateResult {
    const hash = sha256Hex(token);
    const raw = this.db.prepare('SELECT * FROM _refresh_tokens WHERE tokenHash = ?').get(hash);
    if (raw === undefined) return { ok: false, reason: 'invalid' };
    const family = String(raw.family);
    if (raw.revokedAt !== null) {
      this.revokeFamily(family);
      return { ok: false, reason: 'reused' };
    }
    if (String(raw.expiresAt) <= this.stamp()) return { ok: false, reason: 'expired' };
    const user = this.byId(Number(raw.userId));
    if (user === undefined) return { ok: false, reason: 'invalid' };
    if (user.disabled) return { ok: false, reason: 'disabled' };
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE _refresh_tokens SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL').run(this.stamp(), Number(raw.id));
      const refreshToken = this.insertToken(user.id, family, ttlMs);
      this.db.exec('COMMIT');
      return { ok: true, user, refreshToken };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** The user and family a token belongs to, whether or not it is still active. */
  tokenOwner(token: string): { userId: number; family: string } | undefined {
    const raw = this.db.prepare('SELECT userId, family FROM _refresh_tokens WHERE tokenHash = ?').get(sha256Hex(token));
    return raw === undefined ? undefined : { userId: Number(raw.userId), family: String(raw.family) };
  }

  revokeFamily(family: string): number {
    return Number(this.db.prepare('UPDATE _refresh_tokens SET revokedAt = ? WHERE family = ? AND revokedAt IS NULL').run(this.stamp(), family).changes);
  }

  revokeUser(userId: number): number {
    return Number(this.db.prepare('UPDATE _refresh_tokens SET revokedAt = ? WHERE userId = ? AND revokedAt IS NULL').run(this.stamp(), userId).changes);
  }

  revokeSession(id: number): boolean {
    return Number(this.db.prepare('UPDATE _refresh_tokens SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL').run(this.stamp(), id).changes) > 0;
  }

  /** Active sessions: refresh tokens not revoked and not expired. The token hashes are never returned. */
  sessions(userId?: number): SessionRow[] {
    const rows = this.db
      .prepare(
        `SELECT t.id, t.userId, u.username, t.family, t.createdAt, t.expiresAt FROM _refresh_tokens t JOIN _users u ON u.id = t.userId
         WHERE t.revokedAt IS NULL AND t.expiresAt > ? ${userId === undefined ? '' : 'AND t.userId = ?'} ORDER BY t.id`,
      )
      .all(...(userId === undefined ? [this.stamp()] : [this.stamp(), userId]));
    return rows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.userId),
      username: String(row.username),
      family: String(row.family),
      createdAt: String(row.createdAt),
      expiresAt: String(row.expiresAt),
    }));
  }
}
