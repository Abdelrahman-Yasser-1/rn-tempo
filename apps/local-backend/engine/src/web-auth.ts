import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** No 0, O, 1, I or L: the code is read off a terminal and typed or pasted. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;

export const LOGIN_CODE_TTL_MS = 10 * 60_000;
export const SESSION_IDLE_MS = 12 * 60 * 60_000;
export const SESSION_COOKIE = 'tempo_session';
export const CSRF_HEADER = 'x-csrf-token';

export type Clock = () => number;

const sha256 = (text: string): Buffer => createHash('sha256').update(text).digest();
const sameBytes = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b);

/** Upper case, without spaces or dashes, so `abcde-fghjk` and `ABCDEFGHJK` are the same code. */
const normalize = (text: string): string => text.toUpperCase().replace(/[\s-]/g, '');

export type Redeem = { ok: true } | { ok: false; reason: 'wrong' } | { ok: false; reason: 'rate'; retryAfterSec: number };

export interface LoginCodeOptions {
  clock?: Clock;
  ttlMs?: number;
  /** Wrong tries allowed per window (default 5 per minute); past that every try is refused until the window passes. */
  maxFailures?: number;
  windowMs?: number;
}

/**
 * The one-time login code the server prints. One live code at a time: single use, valid for 10 minutes, and wrong
 * tries are rate limited. Only a hash is kept in memory.
 */
export class LoginCodes {
  private readonly clock: Clock;
  private readonly ttlMs: number;
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private live: { hash: Buffer; expiresAt: number } | undefined;
  private failures: number[] = [];

  constructor(options: LoginCodeOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.ttlMs = options.ttlMs ?? LOGIN_CODE_TTL_MS;
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
  }

  /** Makes a new code (the previous one stops working) and returns it, as `XXXXX-XXXXX`. */
  issue(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)] ?? '';
    this.live = { hash: sha256(code), expiresAt: this.clock() + this.ttlMs };
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  }

  /** Checks a code and uses it up when it is right. A wrong, used or expired code all look the same. */
  redeem(input: string): Redeem {
    const now = this.clock();
    this.failures = this.failures.filter((at) => now - at < this.windowMs);
    if (this.failures.length >= this.maxFailures) {
      const oldest = this.failures[0] ?? now;
      return { ok: false, reason: 'rate', retryAfterSec: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)) };
    }
    const live = this.live;
    const right = live !== undefined && now < live.expiresAt && sameBytes(sha256(normalize(input)), live.hash);
    if (!right) {
      this.failures.push(now);
      return { ok: false, reason: 'wrong' };
    }
    this.live = undefined;
    return { ok: true };
  }
}

export interface Session {
  readonly csrf: string;
  readonly createdAt: number;
  lastSeen: number;
}

/** Sessions live in memory: restarting the server ends them. They end after 12 hours without a request. */
export class Sessions {
  private readonly clock: Clock;
  private readonly idleMs: number;
  private readonly maxSessions: number;
  private readonly byId = new Map<string, Session>();

  constructor(options: { clock?: Clock; idleMs?: number; maxSessions?: number } = {}) {
    this.clock = options.clock ?? Date.now;
    this.idleMs = options.idleMs ?? SESSION_IDLE_MS;
    this.maxSessions = options.maxSessions ?? 20;
  }

  /** The key is a hash, so the map never holds a usable cookie value. */
  private key = (id: string): string => sha256(id).toString('hex');

  create(): { id: string; session: Session } {
    this.sweep();
    while (this.byId.size >= this.maxSessions) {
      const oldest = this.byId.keys().next();
      if (oldest.done === true) break;
      this.byId.delete(oldest.value);
    }
    const id = randomBytes(32).toString('base64url');
    const now = this.clock();
    const session: Session = { csrf: randomBytes(32).toString('base64url'), createdAt: now, lastSeen: now };
    this.byId.set(this.key(id), session);
    return { id, session };
  }

  /** The live session for a cookie value; a request counts as activity. */
  get(id: string | undefined): Session | undefined {
    if (id === undefined || id === '') return undefined;
    const session = this.byId.get(this.key(id));
    if (session === undefined) return undefined;
    const now = this.clock();
    if (now - session.lastSeen >= this.idleMs) {
      this.byId.delete(this.key(id));
      return undefined;
    }
    session.lastSeen = now;
    return session;
  }

  destroy(id: string | undefined): void {
    if (id !== undefined) this.byId.delete(this.key(id));
  }

  get size(): number {
    this.sweep();
    return this.byId.size;
  }

  private sweep(): void {
    const now = this.clock();
    for (const [key, session] of this.byId) if (now - session.lastSeen >= this.idleMs) this.byId.delete(key);
  }
}

export function csrfMatches(session: Session, given: string | string[] | undefined): boolean {
  return typeof given === 'string' && sameBytes(Buffer.from(given), Buffer.from(session.csrf));
}

/** The value of one cookie of a `Cookie` header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/**
 * The cookie: `HttpOnly` (scripts cannot read it), `SameSite=Strict` (never sent from another site), `Path=/`, and
 * `Secure` when the page is served over HTTPS. On `http://127.0.0.1` a browser accepts it without `Secure`; that
 * is only safe because that address never leaves the machine.
 */
export function sessionCookie(id: string, options: { secure: boolean }): string {
  // No `Max-Age`: the browser keeps it until it closes, and the server ends the session after 12 hours without a request.
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Strict${options.secure ? '; Secure' : ''}`;
}

export function clearedCookie(options: { secure: boolean }): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${options.secure ? '; Secure' : ''}`;
}
