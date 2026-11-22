import { createHash, randomBytes } from 'node:crypto';

import { atLeast, type ApiKeyScope } from './roles.ts';
import type { ApiKeyRow, TeamStore } from './team-store.ts';
import type { Clock } from './web-auth.ts';

export const KEY_PREFIX = 'tlb_';
/** `lastUsedAt` is written at most this often per key, so a busy public API does not write on every request. */
const TOUCH_EVERY_MS = 60_000;

const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

/** True for text shaped like a key; a quick check before a database lookup. */
export const looksLikeKey = (text: string | undefined): text is string => text !== undefined && /^tlb_[A-Za-z0-9_-]{43}$/.test(text);

/**
 * API keys: `tlb_` plus 32 random bytes (base64url). Only the SHA-256 of the key is stored (it has 256 bits of
 * randomness, so a fast hash is enough), plus a short prefix to recognise it in a list. The whole key is returned once,
 * when it is made.
 */
export class ApiKeys {
  private readonly store: TeamStore;
  private readonly clock: Clock;

  constructor(store: TeamStore, clock: Clock = Date.now) {
    this.store = store;
    this.clock = clock;
  }

  create(input: { backendId: string; name: string; scope: ApiKeyScope; createdBy: string; createdByAccountId?: number }): { key: string; record: ApiKeyRow } {
    const key = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
    const record = this.store.insertKey({ ...input, prefix: key.slice(0, KEY_PREFIX.length + 8), hash: sha256Hex(key), now: new Date(this.clock()).toISOString() });
    return { key, record };
  }

  /** The live key record for a presented key, or `undefined` (unknown, revoked). Records when it was last used. */
  verify(key: string | undefined): ApiKeyRow | undefined {
    if (!looksLikeKey(key)) return undefined;
    const record = this.store.keyByHash(sha256Hex(key));
    if (record === undefined || record.revokedAt !== null || !this.creatorStillAllowed(record)) return undefined;
    const now = this.clock();
    if (record.lastUsedAt === null || now - Date.parse(record.lastUsedAt) >= TOUCH_EVERY_MS) this.store.touchKey(record.id, new Date(now).toISOString());
    return record;
  }

  /**
   * A key is only as good as the access of the person who made it: the account must exist and be active, and still hold
   * on that backend the role the scope needs (`admin` scope: admin; the others: editor or better). The server owner
   * has every role while the account is active. A key made before creators were recorded is not tied to anyone.
   */
  private creatorStillAllowed(record: ApiKeyRow): boolean {
    if (record.createdByAccountId === null) return true;
    const account = this.store.accountById(record.createdByAccountId);
    if (account === undefined || account.disabled) return false;
    if (account.owner) return true;
    const role = this.store.membership(account.id, record.backendId)?.role;
    return role !== undefined && atLeast(role, record.scope === 'admin' ? 'admin' : 'editor');
  }

  /** Revokes the keys an account made on a backend (its membership was removed) or everywhere (it was disabled or deleted). */
  revokeCreatedBy(accountId: number, backendId?: string): number {
    return this.store.revokeKeysOfCreator(accountId, new Date(this.clock()).toISOString(), backendId);
  }

  /** Whether a key is valid for one backend and scope (the public access key check). */
  allows(key: string | undefined, backendId: string, scope: ApiKeyScope): boolean {
    const record = this.verify(key);
    return record !== undefined && record.backendId === backendId && record.scope === scope;
  }

  revoke(id: number): boolean {
    return this.store.revokeKey(id, new Date(this.clock()).toISOString());
  }
}
