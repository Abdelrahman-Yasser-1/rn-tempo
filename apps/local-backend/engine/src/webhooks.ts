import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { matchesEvent, type BackendEvent, type EventBus } from './events.ts';
import type { EngineLogger } from './logs.ts';
import { checkOutboundUrl, httpTransport, OutboundError, type OutboundPolicy, type Transport } from './outbound.ts';
import { publicPayload } from './realtime.ts';
import type { Backend, Webhook } from './schema.ts';
import { newSecret, type SecretStore } from './secrets.ts';

export const SIGNATURE_HEADER = 'x-tempo-signature';
export const EVENT_HEADER = 'x-tempo-event';
export const DELIVERY_HEADER = 'x-tempo-delivery';

/** How long a delivery stays in the log. */
export const DELIVERY_KEEP_DAYS = 7;
export const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const MAX_PENDING = 1000;
const PRUNE_EVERY_MS = 60 * 60_000;

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, like Stripe's header. */
export function signPayload(secret: string, unixSeconds: number, body: string): string {
  return `t=${String(unixSeconds)},v1=${createHmac('sha256', secret).update(`${String(unixSeconds)}.${body}`).digest('hex')}`;
}

/** Checks a signature header the way a receiver should: the HMAC, in constant time, and (when `toleranceSec` is given) a recent `t`. */
export function verifySignature(secret: string, header: string, body: string, options: { toleranceSec?: number; nowSec?: number } = {}): boolean {
  const parts = Object.fromEntries(header.split(',').map((part) => [part.slice(0, part.indexOf('=')).trim(), part.slice(part.indexOf('=') + 1).trim()]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || typeof v1 !== 'string') return false;
  if (options.toleranceSec !== undefined && Math.abs((options.nowSec ?? Math.floor(Date.now() / 1000)) - t) > options.toleranceSec) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${String(t)}.${body}`).digest('hex'));
  const given = Buffer.from(v1);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type DeliveryStatus = 'pending' | 'success' | 'failed' | 'captured';

export interface Attempt {
  n: number;
  at: string;
  ms: number;
  code?: number;
  /** The first 2 KB of the receiver's answer. */
  response?: string;
  error?: string;
}

export interface Delivery {
  id: string;
  webhookId: string;
  event: string;
  eventId: string;
  /** When the event happened. */
  createdAt: string;
  url: string;
  status: DeliveryStatus;
  attempt: number;
  nextAt: string | null;
  attempts: Attempt[];
}

export interface DeliveryDetail extends Delivery {
  body: string;
}

/** What a test sees of a captured delivery: the request as it would have been sent. */
export interface CapturedDelivery {
  id: string;
  webhookId: string;
  event: string;
  url: string;
  headers: Record<string, string>;
  /** The body as text, and parsed. */
  body: string;
  json: unknown;
}

export interface WebhookDeps {
  db: DatabaseSync;
  definition: () => Backend;
  events: EventBus;
  secrets: SecretStore;
  now: () => Date;
  policy: OutboundPolicy;
  /** Test mode: no delays, deterministic ids, and a delivery is captured instead of sent (unless a transport is given). */
  testMode: boolean;
  transport?: Transport;
  random?: () => number;
  logger?: EngineLogger | undefined;
}

interface Row {
  id: string;
  webhook_id: string;
  event: string;
  event_id: string;
  created_at: string;
  url: string;
  body: string;
  status: string;
  attempt: number;
  next_at: number | null;
  attempts: string;
}

/** The value at a dotted path of an object (arrays by index). */
function dig(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const TOKEN = /\{\{\s*event\.([A-Za-z0-9_.]+)\s*\}\}/g;

/** Fills `{{event.*}}` in a template. A string that is only a placeholder keeps the value's type; inside text it becomes text. */
export function renderTemplate(template: unknown, event: { id: string; name: string; createdAt: string; data: unknown }): unknown {
  const lookup = (path: string): unknown => dig(event, path.split('.'));
  if (typeof template === 'string') {
    const whole = /^\{\{\s*event\.([A-Za-z0-9_.]+)\s*\}\}$/.exec(template);
    if (whole?.[1] !== undefined) return lookup(whole[1]) ?? null;
    return template.replace(TOKEN, (_all, path: string) => {
      const found = lookup(path);
      return found === undefined || found === null ? '' : typeof found === 'object' ? JSON.stringify(found) : String(found);
    });
  }
  if (Array.isArray(template)) return template.map((item) => renderTemplate(item, event));
  if (typeof template === 'object' && template !== null) return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, renderTemplate(value, event)]));
  return template;
}

const clip = (text: string): string => (text.length > 2048 ? text.slice(0, 2048) : text);

/**
 * Outgoing webhooks. Every event on the bus that a webhook lists becomes a delivery: a row in `_webhook_deliveries` (so a
 * restart resumes what was pending), a timer for the first attempt, then retries with exponential backoff and jitter.
 * The body is signed with the webhook's secret (kept in `.data/secrets.json`, never in the definition or the log).
 */
export class WebhookService {
  private readonly deps: WebhookDeps;
  private readonly transport: Transport;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly capturedList: CapturedDelivery[] = [];
  private unsubscribe: (() => void) | undefined;
  private pruneTimer: NodeJS.Timeout | undefined;
  private counter = 0;
  private closed = false;

  constructor(deps: WebhookDeps) {
    this.deps = deps;
    this.transport = deps.transport ?? httpTransport;
    deps.db.exec(`CREATE TABLE IF NOT EXISTS _webhook_deliveries (
      id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL, event TEXT NOT NULL, event_id TEXT NOT NULL, created_at TEXT NOT NULL,
      url TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, next_at INTEGER,
      attempts TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL
    )`);
  }

  /** Subscribes to the events and resumes the deliveries that were pending when the engine last stopped. */
  start(): void {
    this.prune();
    this.unsubscribe = this.deps.events.on((event) => this.onEvent(event));
    const pending = this.deps.db.prepare("SELECT id, next_at FROM _webhook_deliveries WHERE status = 'pending'").all() as { id: string; next_at: number | null }[];
    for (const row of pending) this.schedule(row.id, Math.max(0, (row.next_at ?? 0) - this.deps.now().getTime()));
    this.pruneTimer = setInterval(() => this.prune(), PRUNE_EVERY_MS);
    this.pruneTimer.unref();
  }

  close(): void {
    this.closed = true;
    this.unsubscribe?.();
    clearInterval(this.pruneTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private newId(prefix: string): string {
    this.counter += 1;
    return this.deps.testMode ? `${prefix}_${String(this.counter).padStart(6, '0')}` : `${prefix}_${randomBytes(8).toString('hex')}`;
  }

  // ---- secrets

  /** The secret of a webhook is always keyed by its own id: no definition field can point at another webhook's secret. */
  private refOf(hook: Webhook): string {
    return hook.id;
  }

  /** The signing secret of a webhook, made on first use. */
  private secretFor(hook: Webhook): string {
    const ref = this.refOf(hook);
    const existing = this.deps.secrets.section('webhooks')[ref];
    if (typeof existing === 'string' && existing !== '') return existing;
    const made = newSecret('whsec');
    this.deps.secrets.setSection('webhooks', (section) => {
      section[ref] = made;
    });
    return made;
  }

  /** Makes a new secret (the old one stops working) and returns it. This is the only time it is handed out besides creation. */
  rotateSecret(hook: Webhook): string {
    const made = newSecret('whsec');
    this.deps.secrets.setSection('webhooks', (section) => {
      section[this.refOf(hook)] = made;
    });
    return made;
  }

  /** Makes the secret of a webhook that was just created and returns it (shown once). It always makes a new one, so an old secret of that id is never handed out. */
  createSecret(hook: Webhook): string {
    return this.rotateSecret(hook);
  }

  forgetSecret(hook: Webhook): void {
    this.deps.secrets.setSection('webhooks', (section) => {
      delete section[this.refOf(hook)];
    });
  }

  hasSecret(hook: Webhook): boolean {
    return typeof this.deps.secrets.section('webhooks')[this.refOf(hook)] === 'string';
  }

  // ---- events in

  private onEvent(event: BackendEvent): void {
    if (this.closed) return;
    const definition = this.deps.definition();
    for (const hook of definition.webhooks) {
      if (hook.enabled && matchesEvent(hook.events, event.name)) this.enqueue(hook, { name: event.name, at: event.at, data: publicPayload(definition, event) });
    }
  }

  /** A synthetic `webhook.test` event for one webhook (the dashboard's "send a test event"). */
  sendTest(hook: Webhook): Delivery {
    return this.enqueue(hook, { name: 'webhook.test', at: this.deps.now().toISOString(), data: { test: true } }, { immediate: true });
  }

  private enqueue(hook: Webhook, event: { name: string; at: string; data: unknown; id?: string }, options: { immediate?: boolean; body?: string } = {}): Delivery {
    const { db } = this.deps;
    const eventId = event.id ?? this.newId('evt');
    const rendered = { id: eventId, name: event.name, createdAt: event.at, data: event.data };
    const payload = options.body ?? JSON.stringify(hook.body === undefined ? { id: eventId, event: event.name, createdAt: event.at, data: event.data } : renderTemplate(hook.body, rendered));
    const id = this.newId('whd');
    const delay = this.deps.testMode || options.immediate === true ? 0 : (hook.delayMs ?? 0);
    const nowMs = this.deps.now().getTime();
    const waiting = Number(db.prepare("SELECT COUNT(*) AS n FROM _webhook_deliveries WHERE status = 'pending'").get()?.n ?? 0);
    const full = waiting >= MAX_PENDING;
    const attempts: Attempt[] = full ? [{ n: 0, at: new Date(nowMs).toISOString(), ms: 0, error: 'The queue is full.' }] : [];
    db.prepare('INSERT INTO _webhook_deliveries (id, webhook_id, event, event_id, created_at, url, body, status, attempt, next_at, attempts, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)').run(
      id,
      hook.id,
      event.name,
      eventId,
      event.at,
      safeUrl(hook.url),
      payload,
      full ? 'failed' : 'pending',
      full ? null : nowMs + delay,
      JSON.stringify(attempts),
      nowMs,
    );
    if (!full) this.schedule(id, delay);
    return this.toDelivery(this.row(id) as Row);
  }

  // ---- sending

  private schedule(id: string, delayMs: number): void {
    if (this.closed) return;
    clearTimeout(this.timers.get(id));
    const timer = setTimeout(() => {
      this.timers.delete(id);
      void this.run(id);
    }, delayMs);
    timer.unref();
    this.timers.set(id, timer);
  }

  private row(id: string): Row | undefined {
    return this.deps.db.prepare('SELECT * FROM _webhook_deliveries WHERE id = ?').get(id) as unknown as Row | undefined;
  }

  private save(id: string, patch: { status: DeliveryStatus; attempt: number; nextAt: number | null; attempts: Attempt[] }): void {
    this.deps.db.prepare('UPDATE _webhook_deliveries SET status = ?, attempt = ?, next_at = ?, attempts = ?, updated_at = ? WHERE id = ?').run(patch.status, patch.attempt, patch.nextAt, JSON.stringify(patch.attempts.slice(-12)), this.deps.now().getTime(), id);
  }

  private async run(id: string): Promise<void> {
    if (this.closed) return;
    const row = this.row(id);
    if (row === undefined || row.status !== 'pending') return;
    const hook = this.deps.definition().webhooks.find((candidate) => candidate.id === row.webhook_id);
    const attempts = JSON.parse(row.attempts) as Attempt[];
    const n = row.attempt + 1;
    const startedAt = this.deps.now();
    const fail = (error: string, final: boolean): void => {
      attempts.push({ n, at: startedAt.toISOString(), ms: Math.max(0, this.deps.now().getTime() - startedAt.getTime()), error });
      this.finish(id, hook, n, attempts, final);
    };
    if (hook === undefined || !hook.enabled) return fail('The webhook was removed or turned off.', true);
    let url: string;
    try {
      url = checkOutboundUrl(hook.url, this.deps.policy).toString();
    } catch (error) {
      return fail(error instanceof OutboundError ? error.message : 'The address is not allowed.', true);
    }
    const unix = Math.floor(startedAt.getTime() / 1000);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'tempo-local-backend-webhook',
      ...hook.headers,
      [EVENT_HEADER]: row.event,
      [DELIVERY_HEADER]: row.id,
      [SIGNATURE_HEADER]: signPayload(this.secretFor(hook), unix, row.body),
    };
    if (this.deps.testMode && this.deps.transport === undefined) {
      this.capturedList.push({ id: row.id, webhookId: hook.id, event: row.event, url, headers, body: row.body, json: safeJson(row.body) });
      attempts.push({ n, at: startedAt.toISOString(), ms: 0 });
      this.save(id, { status: 'captured', attempt: n, nextAt: null, attempts });
      return;
    }
    try {
      const answer = await this.transport({ url, method: 'POST', headers, body: row.body, timeoutMs: DELIVERY_TIMEOUT_MS }, this.deps.policy);
      if (this.closed) return;
      const ms = Math.max(0, this.deps.now().getTime() - startedAt.getTime());
      attempts.push({ n, at: startedAt.toISOString(), ms, code: answer.status, response: clip(answer.body) });
      if (answer.status >= 200 && answer.status < 300) this.save(id, { status: 'success', attempt: n, nextAt: null, attempts });
      else this.finish(id, hook, n, attempts, false);
    } catch (error) {
      if (this.closed) return;
      const refused = error instanceof OutboundError && !/^No answer/.test(error.message);
      attempts.push({ n, at: startedAt.toISOString(), ms: Math.max(0, this.deps.now().getTime() - startedAt.getTime()), error: error instanceof Error ? error.message : 'The call failed.' });
      this.finish(id, hook, n, attempts, refused);
    }
  }

  /** After a failed attempt: schedule a retry with backoff, or give up. */
  private finish(id: string, hook: Webhook | undefined, n: number, attempts: Attempt[], final: boolean): void {
    const retries = hook?.retries.max ?? 0;
    if (final || hook === undefined || n > retries) {
      this.save(id, { status: 'failed', attempt: n, nextAt: null, attempts });
      this.deps.logger?.warn({ webhook: hook?.id, attempts: n }, 'webhook delivery failed');
      return;
    }
    const base = Math.min(MAX_BACKOFF_MS, hook.retries.baseMs * 2 ** (n - 1));
    const wait = this.deps.testMode ? 0 : Math.round(base * (1 + 0.2 * (this.deps.random ?? Math.random)()));
    this.save(id, { status: 'pending', attempt: n, nextAt: this.deps.now().getTime() + wait, attempts });
    this.schedule(id, wait);
  }

  // ---- the log

  private toDelivery(row: Row): Delivery {
    return {
      id: row.id,
      webhookId: row.webhook_id,
      event: row.event,
      eventId: row.event_id,
      createdAt: row.created_at,
      url: row.url,
      status: row.status as DeliveryStatus,
      attempt: row.attempt,
      nextAt: row.next_at === null ? null : new Date(row.next_at).toISOString(),
      attempts: JSON.parse(row.attempts) as Attempt[],
    };
  }

  deliveries(filter: { webhookId?: string; limit?: number } = {}): Delivery[] {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const rows = (filter.webhookId === undefined
      ? this.deps.db.prepare('SELECT * FROM _webhook_deliveries ORDER BY rowid DESC LIMIT ?').all(limit)
      : this.deps.db.prepare('SELECT * FROM _webhook_deliveries WHERE webhook_id = ? ORDER BY rowid DESC LIMIT ?').all(filter.webhookId, limit)) as unknown as Row[];
    return rows.map((row) => this.toDelivery(row));
  }

  delivery(id: string): DeliveryDetail | undefined {
    const row = this.row(id);
    return row === undefined ? undefined : { ...this.toDelivery(row), body: row.body };
  }

  /** Sends a delivery again as a new one (same event, same body). */
  redeliver(id: string): Delivery | undefined {
    const row = this.row(id);
    const hook = row === undefined ? undefined : this.deps.definition().webhooks.find((candidate) => candidate.id === row.webhook_id);
    if (row === undefined || hook === undefined) return undefined;
    return this.enqueue(hook, { name: row.event, at: row.created_at, data: null, id: row.event_id }, { immediate: true, body: row.body });
  }

  /** Test mode: the deliveries that were captured instead of sent. */
  captured(): CapturedDelivery[] {
    return [...this.capturedList];
  }

  /** Forgets the captured deliveries and the counters (a test kit reset). */
  reset(): void {
    this.capturedList.length = 0;
    this.counter = 0;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  prune(): void {
    this.deps.db.prepare('DELETE FROM _webhook_deliveries WHERE updated_at < ?').run(this.deps.now().getTime() - DELIVERY_KEEP_DAYS * 86_400_000);
  }
}

/** A URL fit for a log or a list: no user name or password, no fragment, and every query value hidden. */
export function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const keys = [...new Set(url.searchParams.keys())];
    return `${url.origin}${url.pathname}${keys.length === 0 ? '' : `?${keys.map((key) => `${encodeURIComponent(key)}=***`).join('&')}`}`;
  } catch {
    return '[invalid address]';
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
