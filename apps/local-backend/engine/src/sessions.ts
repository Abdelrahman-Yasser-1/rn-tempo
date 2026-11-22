import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { startBackend, type RunningBackend, type StartOptions } from './app.ts';
import { buildTestSnapshot, loadTestSnapshotData, writeTestSnapshotFiles } from './test-snapshot.ts';

export const SESSION_DEFAULTS = {
  ttlMs: 30 * 60_000,
  maxTtlMs: 6 * 60 * 60_000,
  perBackend: 20,
  perKey: 10,
  totalBytes: 1024 * 1024 * 1024,
  /** Media a session copies whole (a session may hold more than a test kit snapshot). */
  mediaBytes: 64 * 1024 * 1024,
  /** The largest copy of a backend a session is made from (the JSON document of the snapshot). */
  maxCopyBytes: 256 * 1024 * 1024,
  sweepEveryMs: 60_000,
} as const;

export interface SessionLimits {
  ttlMs?: number;
  maxTtlMs?: number;
  perBackend?: number;
  perKey?: number;
  totalBytes?: number;
  mediaBytes?: number;
  maxCopyBytes?: number;
}

export interface SessionInfo {
  id: string;
  backendId: string;
  /** The API key that made it. */
  keyId: number;
  expiresAt: number;
  bytes: number;
}

interface Live extends SessionInfo {
  running: RunningBackend;
  dir: string;
}

export type CreateOutcome = { ok: true; session: SessionInfo } | { ok: false; reason: 'limit'; detail: string; retryAfterSec: number } | { ok: false; reason: 'ttl'; detail: string };

export const SESSION_ID = /^[0-9a-f]{32}$/;

function folderBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += folderBytes(path);
    else if (entry.isFile()) total += lstatSync(path).size;
  }
  return total;
}

/**
 * Temporary, isolated copies of a backend for CI. Each is its own engine (its own SQLite file and media folder under
 * `<dataDir>/sessions/<id>`), started from the test snapshot of the source backend: the definition, handlers, seed, data,
 * content and media, never secrets, app users or sign-in sessions. A session is reachable only at `/s/<id>/`, its id is
 * 128 random bits, and it is deleted by `DELETE` or when its time is up. Sessions live in memory: a restart removes the
 * folders of the ones that were running.
 */
export class TempSessions {
  private readonly dir: string;
  private readonly clock: () => number;
  private readonly limits: Required<SessionLimits>;
  private readonly start: StartOptions;
  private readonly live = new Map<string, Live>();
  private readonly timer: NodeJS.Timeout;

  constructor(options: { dir: string; clock?: () => number; limits?: SessionLimits; start?: StartOptions; sweepEveryMs?: number }) {
    this.dir = options.dir;
    this.clock = options.clock ?? Date.now;
    this.limits = { ...SESSION_DEFAULTS, ...(options.limits ?? {}) };
    this.start = options.start ?? {};
    // Folders of sessions that were running when the process stopped belong to nobody now.
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.timer = setInterval(() => void this.sweep(), options.sweepEveryMs ?? SESSION_DEFAULTS.sweepEveryMs);
    this.timer.unref();
  }

  get count(): number {
    return this.live.size;
  }

  list(): SessionInfo[] {
    return [...this.live.values()].map(({ id, backendId, keyId, expiresAt, bytes }) => ({ id, backendId, keyId, expiresAt, bytes }));
  }

  /** Disk used by all sessions. */
  usedBytes(): number {
    return [...this.live.values()].reduce((sum, session) => sum + session.bytes, 0);
  }

  /** The running engine of a live session. A session past its time is deleted on the spot. */
  async get(id: string): Promise<RunningBackend | undefined> {
    const found = this.live.get(id);
    if (found === undefined) return undefined;
    if (found.expiresAt <= this.clock()) {
      await this.remove(id);
      return undefined;
    }
    return found.running;
  }

  /** Makes a session. `ttlMs` defaults to 30 minutes and may not pass 6 hours. */
  async create(input: { backendId: string; keyId: number; source: RunningBackend; ttlMs?: number; accessKey?: StartOptions['accessKey'] }): Promise<CreateOutcome> {
    const ttl = input.ttlMs ?? this.limits.ttlMs;
    if (!Number.isFinite(ttl) || ttl < 1000 || ttl > this.limits.maxTtlMs) return { ok: false, reason: 'ttl', detail: `ttlSeconds must be between 1 and ${String(this.limits.maxTtlMs / 1000)}.` };
    await this.sweep();
    const mine = [...this.live.values()].filter((session) => session.backendId === input.backendId);
    const byKey = mine.filter((session) => session.keyId === input.keyId);
    const refuse = (detail: string, among: readonly Live[]): CreateOutcome => {
      const soonest = Math.min(...(among.length === 0 ? [...this.live.values()] : among).map((session) => session.expiresAt));
      return { ok: false, reason: 'limit', detail, retryAfterSec: Math.max(1, Math.ceil((soonest - this.clock()) / 1000)) };
    };
    if (mine.length >= this.limits.perBackend) return refuse(`This backend already has ${String(this.limits.perBackend)} sessions. Delete one or wait for one to expire.`, mine);
    if (byKey.length >= this.limits.perKey) return refuse(`This API key already has ${String(this.limits.perKey)} sessions. Delete one or wait for one to expire.`, byKey);
    if (this.usedBytes() >= this.limits.totalBytes) return refuse('The server has no room for another session right now.', []);

    const id = randomBytes(16).toString('hex');
    const dir = join(this.dir, id);
    const engine = input.source.engine;
    let running: RunningBackend | undefined;
    try {
      const snapshot = buildTestSnapshot({ dir: engine.folder.dir, db: engine.store.db, collections: engine.definition.collections.map((collection) => collection.name), mediaBytes: this.limits.mediaBytes, maxBytes: this.limits.maxCopyBytes });
      writeTestSnapshotFiles(snapshot, dir);
      running = await startBackend(dir, {
        ...this.start,
        port: 0,
        host: '127.0.0.1',
        https: false,
        adminListener: false,
        watch: false,
        testMode: true,
        mounted: { prefix: `/s/${id}` },
        ...(input.accessKey === undefined ? {} : { accessKey: input.accessKey }),
      });
      loadTestSnapshotData(running.engine.store.db, snapshot);
    } catch (error) {
      await running?.stop().catch(() => undefined);
      rmSync(dir, { recursive: true, force: true });
      throw error;
    }
    const bytes = folderBytes(dir);
    const session: Live = { id, backendId: input.backendId, keyId: input.keyId, expiresAt: this.clock() + ttl, bytes, running, dir };
    this.live.set(id, session);
    return { ok: true, session: { id, backendId: input.backendId, keyId: input.keyId, expiresAt: session.expiresAt, bytes } };
  }

  /** Deletes a session of this backend. Returns false when there is none (or it belongs to another backend). */
  async delete(backendId: string, id: string): Promise<boolean> {
    const found = this.live.get(id);
    if (found === undefined || found.backendId !== backendId) return false;
    await this.remove(id);
    return true;
  }

  /** Deletes the sessions of a backend (it was stopped or removed). */
  async deleteAllOf(backendId: string): Promise<void> {
    for (const session of [...this.live.values()]) if (session.backendId === backendId) await this.remove(session.id);
  }

  private async remove(id: string): Promise<void> {
    const found = this.live.get(id);
    if (found === undefined) return;
    this.live.delete(id);
    await found.running.stop().catch(() => undefined);
    rmSync(found.dir, { recursive: true, force: true });
  }

  /** Deletes every session whose time is up. The team server runs it every minute. */
  async sweep(): Promise<number> {
    const now = this.clock();
    const expired = [...this.live.values()].filter((session) => session.expiresAt <= now);
    for (const session of expired) await this.remove(session.id);
    return expired.length;
  }

  async stopAll(): Promise<void> {
    clearInterval(this.timer);
    for (const id of [...this.live.keys()]) await this.remove(id);
  }
}
