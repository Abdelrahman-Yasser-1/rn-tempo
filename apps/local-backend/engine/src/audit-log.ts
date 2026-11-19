import { auditSummary, type Actor, type AuditEntry, type AuditFilter } from './audit.ts';
import type { TeamStore } from './team-store.ts';
import type { Clock } from './web-auth.ts';

export const DEFAULT_AUDIT_DAYS = 90;
const DAY_MS = 24 * 60 * 60_000;

export interface AuditRecord {
  actor: Actor;
  backend: string | null;
  /** What was done: `PUT /endpoints/:id`, `member.invite`, `login`. */
  action: string;
  /** What it was done to, in plain words. */
  target: string;
  status: number;
  denied?: boolean;
  before?: unknown;
  after?: unknown;
  /** Bytes of an upload. The bytes themselves are never kept. */
  uploadBytes?: number;
}

/**
 * The audit log: every admin write with who, when, which backend, what and a short before/after. Summaries go through
 * `auditSummary`, so they never hold a password, token, key, TOTP secret or media bytes. Entries older than the
 * retention (90 days by default) are deleted.
 */
export class AuditLog {
  private readonly store: TeamStore;
  private readonly clock: Clock;
  readonly retentionDays: number;

  constructor(store: TeamStore, options: { clock?: Clock; retentionDays?: number } = {}) {
    this.store = store;
    this.clock = options.clock ?? Date.now;
    this.retentionDays = options.retentionDays ?? DEFAULT_AUDIT_DAYS;
    this.prune();
  }

  record(entry: AuditRecord): void {
    const before = auditSummary(entry.before);
    const after = entry.uploadBytes === undefined ? auditSummary(entry.after) : { upload: `${String(entry.uploadBytes)} bytes (not stored)` };
    const summary = before === undefined && after === undefined ? null : JSON.stringify({ ...(before === undefined ? {} : { before }), ...(after === undefined ? {} : { after }) });
    this.store.insertAudit({
      at: new Date(this.clock()).toISOString(),
      actor: { kind: entry.actor.kind, id: entry.actor.id, label: entry.actor.label.slice(0, 120) },
      backend: entry.backend,
      action: entry.action,
      target: entry.target.slice(0, 200),
      status: entry.status,
      denied: entry.denied === true,
      summary,
    });
  }

  query(filter: AuditFilter): { entries: AuditEntry[]; total: number } {
    return this.store.queryAudit(filter);
  }

  /** Deletes what is past the retention. Returns how many entries went. */
  prune(): number {
    return this.store.pruneAudit(new Date(this.clock() - this.retentionDays * DAY_MS).toISOString());
  }
}
