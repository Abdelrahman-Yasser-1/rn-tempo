import { createHash, randomBytes, randomInt } from 'node:crypto';

import { decryptText, encryptText, hashCode } from './team-secret.ts';
import type { AccountRow, TeamStore } from './team-store.ts';
import { base32Decode, newTotpSecret, otpauthUri, verifyTotp } from './totp.ts';
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from './tokens.ts';
import type { Clock } from './web-auth.ts';

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60_000;
export const SETUP_LINK_TTL_MS = 24 * 60 * 60_000;
export const MIN_PASSWORD_LENGTH = 10;
export const RECOVERY_CODE_COUNT = 10;
const ISSUER = 'Tempo Local Backend';
/** No 0, O, 1, I, L: recovery codes are copied by hand. */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
export const emailOk = (email: string): boolean => email.length <= 254 && EMAIL.test(email);

/** A sliding window per key (an IP address): `hit` says whether one more try is allowed, and counts it. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  private readonly max: number;
  private readonly windowMs: number;
  private readonly clock: Clock;

  constructor(max: number, windowMs: number, clock: Clock = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.clock = clock;
  }

  hit(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
    const now = this.clock();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil(((recent[0] ?? now) + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) for (const [k, times] of this.hits) if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(k);
    return { ok: true };
  }
}

export type LoginResult =
  | { ok: true; account: AccountRow; usedRecoveryCode: boolean }
  /** `invalid`: unknown email, wrong password, disabled or not set up: all the same answer. `code`: the TOTP or recovery code is wrong. */
  | { ok: false; reason: 'invalid' | 'code' | 'totp-required' }
  | { ok: false; reason: 'locked' | 'rate'; retryAfterSec: number };

export interface TeamAuthOptions {
  clock?: Clock;
  maxFailures?: number;
  lockoutMs?: number;
  /** Login or setup tries per IP and minute (default 20). */
  ipPerMinute?: number;
}

export class TeamAuth {
  private readonly clock: Clock;
  private readonly maxFailures: number;
  private readonly lockoutMs: number;
  private readonly ipLimiter: RateLimiter;

  readonly store: TeamStore;
  private readonly secret: Buffer;

  constructor(store: TeamStore, secret: Buffer, options: TeamAuthOptions = {}) {
    this.store = store;
    this.secret = secret;
    this.clock = options.clock ?? Date.now;
    this.maxFailures = options.maxFailures ?? MAX_FAILURES;
    this.lockoutMs = options.lockoutMs ?? LOCKOUT_MS;
    this.ipLimiter = new RateLimiter(options.ipPerMinute ?? 20, 60_000, this.clock);
  }

  private iso(): string {
    return new Date(this.clock()).toISOString();
  }

  /** One try from an address (login or setup link); refuses past the limit. */
  ipAllowed(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
    return this.ipLimiter.hit(ip);
  }

  // ---- owner and invitations

  /** The server owner. Called only by the CLI (`server owner create`); no route reaches it. */
  async createOwner(input: { email: string; name: string; password: string }): Promise<AccountRow> {
    const email = normalizeEmail(input.email);
    if (!emailOk(email)) throw new Error('That is not a valid email address.');
    this.checkPassword(input.password);
    if (this.store.hasOwner()) throw new Error('This server already has an owner. Use `server owner reset-password` to recover access.');
    if (this.store.accountByEmail(email) !== undefined) throw new Error('An account with that email already exists.');
    return this.store.insertAccount({ email, name: input.name.trim() || email, passwordHash: await hashPassword(input.password), owner: true, now: this.iso() });
  }

  /** CLI recovery: a new password for the owner, with TOTP cleared when asked, and the lockout lifted. */
  async resetOwnerPassword(email: string, password: string, resetTotp: boolean): Promise<void> {
    const account = this.store.accountByEmail(normalizeEmail(email));
    if (account === undefined || !account.owner) throw new Error('There is no owner with that email.');
    this.checkPassword(password);
    this.store.setPassword(account.id, await hashPassword(password));
    this.store.clearFailures(normalizeEmail(email));
    if (resetTotp) this.store.clearTotp(account.id);
  }

  checkPassword(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use a password of at least ${String(MIN_PASSWORD_LENGTH)} characters.`);
    if (password.length > MAX_PASSWORD_LENGTH) throw new Error(`Use a password of up to ${String(MAX_PASSWORD_LENGTH)} characters.`);
  }

  /** A fresh one-time setup link token (24 hours). Only its hash is stored; the token is returned once. */
  issueSetupToken(accountId: number): { token: string; expiresAt: string } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.clock() + SETUP_LINK_TTL_MS).toISOString();
    this.store.insertSetupToken(sha256Hex(token), accountId, expiresAt);
    return { token, expiresAt };
  }

  /** Creates an account without a password and the link that lets its person choose one. */
  invite(input: { email: string; name: string }): { account: AccountRow; token: string; expiresAt: string } {
    const email = normalizeEmail(input.email);
    if (!emailOk(email)) throw new Error('That is not a valid email address.');
    const account = this.store.insertAccount({ email, name: input.name.trim() || email, passwordHash: null, owner: false, now: this.iso() });
    return { account, ...this.issueSetupToken(account.id) };
  }

  /** Uses a setup link: the person picks a password. A used, expired or unknown link all look the same. */
  async redeemSetup(token: string, password: string): Promise<AccountRow | undefined> {
    this.checkPassword(password);
    const hash = await hashPassword(password);
    const accountId = this.store.consumeSetupToken(sha256Hex(token), this.iso());
    if (accountId === undefined) return undefined;
    this.store.setPassword(accountId, hash);
    this.store.clearFailures(this.store.accountById(accountId)?.email ?? '');
    return this.store.accountById(accountId);
  }

  // ---- login

  private lockKey = (email: string): string => normalizeEmail(email);

  private recordFailure(key: string): void {
    const now = this.clock();
    const current = this.store.failures(key);
    // Failures older than the lockout time are forgotten, so four typos in a month do not add up to a lock.
    const count = (current !== undefined && now - current.updatedAt < this.lockoutMs ? current.count : 0) + 1;
    if (count >= this.maxFailures) this.store.saveFailures(key, 0, now + this.lockoutMs, now);
    else this.store.saveFailures(key, count, 0, now);
    this.store.pruneFailures(now - 24 * 60 * 60_000);
  }

  /**
   * Email + password, then the TOTP or a recovery code when the account has TOTP on. Unknown email, wrong password,
   * a disabled account and an account that never chose a password all give the same answer after the same work.
   * Five failures lock that email for 15 minutes (the counter is by email, so an unknown email behaves the same).
   */
  async login(input: { email: string; password: string; code?: string }, ip: string): Promise<LoginResult> {
    const limited = this.ipLimiter.hit(ip);
    if (!limited.ok) return { ok: false, reason: 'rate', retryAfterSec: limited.retryAfterSec };
    const email = normalizeEmail(input.email);
    const key = this.lockKey(email);
    const now = this.clock();
    const state = this.store.failures(key);
    if (state !== undefined && state.lockedUntil > now) return { ok: false, reason: 'locked', retryAfterSec: Math.max(1, Math.ceil((state.lockedUntil - now) / 1000)) };
    const account = email.length > 254 ? undefined : this.store.accountByEmail(email);
    const passwordOk = await verifyPassword(input.password, account?.passwordHash ?? null);
    if (account === undefined || !passwordOk || account.disabled) {
      this.recordFailure(key);
      return { ok: false, reason: 'invalid' };
    }
    let usedRecoveryCode = false;
    if (account.totpSecret !== null) {
      const code = (input.code ?? '').trim();
      if (code === '') return { ok: false, reason: 'totp-required' };
      const checked = this.checkSecondFactor(account, code);
      if (!checked.ok) {
        this.recordFailure(key);
        return { ok: false, reason: 'code' };
      }
      usedRecoveryCode = checked.recovery;
    }
    this.store.clearFailures(key);
    this.store.setLastLogin(account.id, this.iso());
    return { ok: true, account, usedRecoveryCode };
  }

  private checkSecondFactor(account: AccountRow, code: string): { ok: true; recovery: boolean } | { ok: false } {
    if (/^\d{6}$/.test(code)) {
      const secret = account.totpSecret === null ? undefined : decryptText(this.secret, account.totpSecret, `totp:${String(account.id)}`);
      const bytes = secret === undefined ? undefined : base32Decode(secret);
      const step = bytes === undefined ? undefined : verifyTotp(bytes, code, this.clock());
      // A code already used (or an older step) is refused, so a code seen over a shoulder or in a log cannot be replayed.
      if (step === undefined || step <= account.totpLastStep) return { ok: false };
      this.store.setTotpLastStep(account.id, step);
      return { ok: true, recovery: false };
    }
    const normalized = code.toLowerCase().replace(/[\s-]/g, '');
    if (!/^[a-z0-9]{10}$/.test(normalized)) return { ok: false };
    return this.store.useRecoveryCode(account.id, hashCode(this.secret, normalized), this.iso()) ? { ok: true, recovery: true } : { ok: false };
  }

  // ---- TOTP set-up (the signed-in account's own profile)

  /** A new secret, kept encrypted as "pending" until a code from it is confirmed. */
  beginTotp(account: AccountRow): { secret: string; uri: string } {
    const secret = newTotpSecret();
    this.store.setTotpPending(account.id, encryptText(this.secret, secret, `totp:${String(account.id)}`));
    return { secret, uri: otpauthUri({ secret, account: account.email, issuer: ISSUER }) };
  }

  /** Confirms the pending secret with a code from the app, turns TOTP on and returns the recovery codes (shown once). */
  confirmTotp(account: AccountRow, code: string): { recoveryCodes: string[] } | undefined {
    const pending = account.totpPending === null ? undefined : decryptText(this.secret, account.totpPending, `totp:${String(account.id)}`);
    const bytes = pending === undefined ? undefined : base32Decode(pending);
    const step = bytes === undefined ? undefined : verifyTotp(bytes, code.trim(), this.clock());
    if (pending === undefined || step === undefined) return undefined;
    this.store.enableTotp(account.id, encryptText(this.secret, pending, `totp:${String(account.id)}`), step);
    return { recoveryCodes: this.newRecoveryCodes(account.id) };
  }

  newRecoveryCodes(accountId: number): string[] {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      let text = '';
      for (let i = 0; i < 10; i += 1) text += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)] ?? '';
      return `${text.slice(0, 5)}-${text.slice(5)}`;
    });
    this.store.replaceRecoveryCodes(accountId, codes.map((code) => hashCode(this.secret, code.replace('-', ''))));
    return codes;
  }

  /** The signed-in account proves its password again before a security change. */
  async passwordMatches(account: AccountRow, password: string): Promise<boolean> {
    return verifyPassword(password, account.passwordHash);
  }

  async changePassword(account: AccountRow, current: string, next: string): Promise<boolean> {
    this.checkPassword(next);
    if (!(await this.passwordMatches(account, current))) return false;
    this.store.setPassword(account.id, await hashPassword(next));
    return true;
  }

  totpState(account: AccountRow): { enabled: boolean; recoveryCodesLeft: number } {
    return { enabled: account.totpSecret !== null, recoveryCodesLeft: account.totpSecret === null ? 0 : this.store.unusedRecoveryCodes(account.id) };
  }
}
