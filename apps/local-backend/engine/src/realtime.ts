import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { redactDeep, scrubKeys } from '@rn-tempo/dev-api';

import { matchesEvent, type BackendEvent, type EventBus } from './events.ts';
import type { Backend, Endpoint } from './schema.ts';

/**
 * What SSE and WebSocket endpoints and GraphQL subscriptions share: one `Hub` per endpoint that knows its connected
 * clients, a short log of recent messages (for the dashboard's Live panel), the resume buffer of an SSE endpoint, and the
 * data change events to forward. A hub holds no timers of its own: the clients own theirs and clear them on close.
 */

export type RealtimeKind = 'sse' | 'websocket' | 'graphql';

/** What a hub asks of one connected client, whatever the protocol. */
export interface RealtimeClient {
  readonly id: string;
  readonly connectedAt: string;
  /** A short hash of the address, never the address. */
  readonly ipHash: string;
  /** The signed-in app user, when the endpoint knows one. */
  user?: string | undefined;
  protocol?: string | undefined;
  messagesIn: number;
  messagesOut: number;
  /** Sends one message. False when the client cannot take it (it is closing, or too slow and has been dropped). */
  send(message: { event?: string | undefined; data: unknown }, id?: number): boolean;
  close(code?: number, reason?: string): void;
}

export interface ClientView {
  id: string;
  connectedAt: string;
  ipHash: string;
  user?: string;
  protocol?: string;
  messagesIn: number;
  messagesOut: number;
}

export interface LogLine {
  at: string;
  /** `in` came from a client, `out` went to one, `event` is a forwarded data change, `system` is a connect or disconnect. */
  direction: 'in' | 'out' | 'event' | 'system';
  clientId?: string;
  event?: string;
  text: string;
}

export interface BufferedMessage {
  id: number;
  event?: string | undefined;
  data: unknown;
}

const LOG_SIZE = 100;
const MAX_LOG_TEXT = 500;

/** Message text for the log: redacted (secrets, keys), one line's worth, cut at a fixed length. */
export function logText(data: unknown): string {
  const redacted = typeof data === 'string' ? scrubKeys(data) : redactDeep(data);
  const text = typeof redacted === 'string' ? redacted : (JSON.stringify(redacted) ?? '');
  return text.length > MAX_LOG_TEXT ? `${text.slice(0, MAX_LOG_TEXT)}...` : text;
}

export class Hub {
  readonly endpointId: string;
  readonly kind: RealtimeKind;
  private readonly clients = new Map<string, RealtimeClient>();
  private readonly lines: LogLine[] = [];
  private readonly buffer: BufferedMessage[] = [];
  private nextMessageId = 1;
  private readonly now: () => Date;

  constructor(endpointId: string, kind: RealtimeKind, now: () => Date) {
    this.endpointId = endpointId;
    this.kind = kind;
    this.now = now;
  }

  get size(): number {
    return this.clients.size;
  }

  /** Why a new client may not join, or `undefined` when it may. */
  refusal(ipHash: string, limits: { maxConnections: number; maxConnectionsPerIp: number }): 'endpoint' | 'ip' | undefined {
    if (this.clients.size >= limits.maxConnections) return 'endpoint';
    let same = 0;
    for (const client of this.clients.values()) if (client.ipHash === ipHash) same += 1;
    return same >= limits.maxConnectionsPerIp ? 'ip' : undefined;
  }

  add(client: RealtimeClient): void {
    this.clients.set(client.id, client);
    this.log({ direction: 'system', clientId: client.id, text: 'connected' });
  }

  remove(client: RealtimeClient, reason = 'disconnected'): void {
    if (this.clients.delete(client.id)) this.log({ direction: 'system', clientId: client.id, text: reason });
  }

  get(id: string): RealtimeClient | undefined {
    return this.clients.get(id);
  }

  list(): ClientView[] {
    return [...this.clients.values()].map((client) => ({
      id: client.id,
      connectedAt: client.connectedAt,
      ipHash: client.ipHash,
      ...(client.user === undefined ? {} : { user: client.user }),
      ...(client.protocol === undefined ? {} : { protocol: client.protocol }),
      messagesIn: client.messagesIn,
      messagesOut: client.messagesOut,
    }));
  }

  log(line: Omit<LogLine, 'at'>): void {
    this.lines.push({ at: this.now().toISOString(), ...line });
    if (this.lines.length > LOG_SIZE) this.lines.shift();
  }

  recent(): LogLine[] {
    return [...this.lines];
  }

  /**
   * Sends a message to every client. An SSE hub also keeps it (with an id) so a client that reconnects can ask for what it
   * missed; `keep` is how many it holds.
   */
  broadcast(message: { event?: string | undefined; data: unknown }, keep = 0): number {
    const id = this.nextMessageId;
    this.nextMessageId += 1;
    const keeps = this.kind === 'sse' && keep > 0;
    if (keeps) {
      this.buffer.push({ id, event: message.event, data: message.data });
      if (this.buffer.length > keep) this.buffer.splice(0, this.buffer.length - keep);
    }
    let sent = 0;
    for (const client of [...this.clients.values()]) if (client.send(message, keeps ? id : undefined)) sent += 1;
    return sent;
  }

  /** Buffered messages after `lastId`, oldest first. */
  missedSince(lastId: number): BufferedMessage[] {
    return this.buffer.filter((message) => message.id > lastId);
  }

  closeAll(code = 1001, reason = 'The backend is stopping.'): void {
    for (const client of [...this.clients.values()]) client.close(code, reason);
    this.clients.clear();
  }
}

/** Sends a manual message (the dashboard's send form) to one client or all. Returns how many clients got it. */
export function sendManual(hub: Hub, keep: number, message: { event?: string | undefined; data: unknown }, clientId?: string): number {
  hub.log({ direction: 'out', ...(clientId === undefined ? {} : { clientId }), ...(message.event === undefined ? {} : { event: message.event }), text: logText(message.data) });
  if (clientId === undefined) return hub.broadcast(message, keep);
  return hub.get(clientId)?.send(message) === true ? 1 : 0;
}

/** The fields a crud endpoint hides, for each collection: no event or subscription may show them either. */
export function hiddenFieldsByCollection(definition: Backend): Map<string, Set<string>> {
  const hidden = new Map<string, Set<string>>();
  for (const endpoint of definition.endpoints) {
    if (endpoint.type !== 'crud') continue;
    const set = hidden.get(endpoint.collection) ?? new Set<string>();
    for (const name of endpoint.hiddenFields) set.add(name);
    hidden.set(endpoint.collection, set);
  }
  return hidden;
}

/** An event's payload with the hidden fields of its collection left out of `record`. */
export function publicPayload(definition: Backend, event: BackendEvent): unknown {
  const payload = event.payload;
  if (typeof payload !== 'object' || payload === null) return payload;
  const { collection, record } = payload as { collection?: unknown; record?: unknown };
  if (typeof collection !== 'string' || typeof record !== 'object' || record === null) return payload;
  const hidden = hiddenFieldsByCollection(definition).get(collection);
  if (hidden === undefined || hidden.size === 0) return payload;
  return { ...payload, record: Object.fromEntries(Object.entries(record).filter(([key]) => !hidden.has(key))) };
}

/** The `on` list of an endpoint that forwards events (`sse`, `websocket`). */
export function forwardsOf(endpoint: Endpoint | undefined): readonly string[] {
  return endpoint !== undefined && endpoint.type === 'sse' ? endpoint.on : [];
}

export interface RealtimeOptions {
  events: EventBus;
  definition: () => Backend;
  now: () => Date;
}

/** Every hub of a backend, and the one listener on the event bus that feeds them. */
export class Realtime {
  private readonly hubs = new Map<string, Hub>();
  private readonly options: RealtimeOptions;
  private readonly salt = randomBytes(8).toString('hex');
  private readonly stop: () => void;
  /** The endpoint as it was when its clients connected, to tell an edited one from an untouched one. */
  private readonly signatures = new Map<string, string>();

  constructor(options: RealtimeOptions) {
    this.options = options;
    this.stop = options.events.on((event) => this.forward(event));
  }

  hub(endpointId: string, kind: RealtimeKind): Hub {
    let found = this.hubs.get(endpointId);
    if (found === undefined || found.kind !== kind) {
      found?.closeAll(1001, 'The endpoint changed.');
      found = new Hub(endpointId, kind, this.options.now);
      this.hubs.set(endpointId, found);
    }
    return found;
  }

  existing(endpointId: string): Hub | undefined {
    return this.hubs.get(endpointId);
  }

  /** A short, stable hash of an address for the client list and the per-address limit. */
  hashIp(ip: string | undefined): string {
    return createHash('sha256').update(`${this.salt}:${ip ?? 'unknown'}`).digest('hex').slice(0, 12);
  }

  newId(): string {
    return randomUUID().slice(0, 8);
  }

  /** Clients of an endpoint that was removed or edited are disconnected: they hold the old script, rules or schema. */
  reconcile(definition: Backend): void {
    const current = new Map(definition.endpoints.map((endpoint) => [endpoint.id, JSON.stringify(endpoint)]));
    for (const [id, hub] of [...this.hubs]) {
      const signature = current.get(id);
      const before = this.signatures.get(id);
      if (signature === undefined || (before !== undefined && before !== signature)) {
        hub.closeAll(1012, 'The endpoint was changed.');
        this.hubs.delete(id);
        this.signatures.delete(id);
      }
    }
    for (const [id, signature] of current) if (this.hubs.has(id)) this.signatures.set(id, signature);
  }

  /** Remembers the endpoint a hub was made for (see `reconcile`). */
  track(endpoint: Endpoint): void {
    this.signatures.set(endpoint.id, JSON.stringify(endpoint));
  }

  private forward(event: BackendEvent): void {
    if (this.hubs.size === 0) return;
    const definition = this.options.definition();
    for (const [id, hub] of this.hubs) {
      const endpoint = definition.endpoints.find((candidate) => candidate.id === id);
      if (endpoint === undefined || (hub.size === 0 && endpoint.type !== 'sse')) continue;
      const patterns = forwardsOf(endpoint);
      if (patterns.length === 0 || !matchesEvent(patterns, event.name)) continue;
      const data = publicPayload(definition, event);
      const keep = endpoint.type === 'sse' ? endpoint.bufferSize : 0;
      hub.log({ direction: 'event', event: event.name, text: logText(data) });
      hub.broadcast({ event: event.name, data }, keep);
    }
  }

  closeAll(): void {
    this.stop();
    for (const hub of this.hubs.values()) hub.closeAll();
    this.hubs.clear();
  }
}
