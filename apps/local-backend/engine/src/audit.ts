import { redactDeep } from './shared/redact.ts';

/** Who did something: an account (its email) or an API key (its display prefix, never the key). */
export interface Actor {
  kind: 'account' | 'key' | 'system';
  /** Account id, key id, or `cli`. */
  id: string;
  /** The email, the key's display prefix, or a short name. */
  label: string;
}

const MAX_STRING = 160;
const MAX_ITEMS = 12;
const MAX_JSON = 3000;
const SECRET_VALUE = /\b(tlb_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/g;

function shrink(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    const clean = value.replace(SECRET_VALUE, '[REDACTED]');
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}... (${String(clean.length)} characters)` : clean;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => shrink(item, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `... ${String(value.length - MAX_ITEMS)} more`] : items;
  }
  if (value !== null && typeof value === 'object') {
    if (depth > 5) return '[TRUNCATED]';
    const entries = Object.entries(value);
    const kept = Object.fromEntries(entries.slice(0, 40).map(([key, child]) => [key, shrink(child, depth + 1)]));
    return entries.length > 40 ? { ...kept, '...': `${String(entries.length - 40)} more fields` } : kept;
  }
  return value;
}

/**
 * What the audit log keeps of a request body or an item: sensitive keys are replaced (passwords, tokens, keys, TOTP
 * secrets, emails of app users), secret-looking values are scrubbed from any string, long text and big lists are cut,
 * and the whole is capped. Media bytes never get here: an upload is summarised by its size.
 */
export function auditSummary(value: unknown): unknown {
  if (value === undefined) return undefined;
  const safe = shrink(redactDeep(value), 0);
  const text = JSON.stringify(safe);
  return text.length > MAX_JSON ? { truncated: `${text.slice(0, MAX_JSON)}...` } : safe;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: Actor;
  backend: string | null;
  action: string;
  target: string;
  status: number;
  denied: boolean;
  summary: { before?: unknown; after?: unknown } | null;
}

export interface AuditFilter {
  backend?: string;
  actor?: string;
  action?: string;
  since?: string;
  until?: string;
  limit?: number;
  skip?: number;
}
