/**
 * The data change events of one backend. A write (crud, the admin data browser, a handler's `db`, the test kit's
 * `data.insert`) publishes `<collection>.created`, `<collection>.updated` or `<collection>.deleted` once it is committed,
 * publishing or unpublishing a content entry publishes `content.published` or `content.unpublished`, and a handler can
 * publish its own with `ctx.emit(name, payload)`. SSE and WebSocket endpoints and GraphQL subscriptions listen here.
 *
 * The bus lives in the process and is per backend: nothing is stored, and an event nobody listens to costs nothing.
 */

export interface BackendEvent {
  name: string;
  payload: unknown;
  /** ISO time the event was published. */
  at: string;
}

export type EventListener = (event: BackendEvent) => void;

/** The part of a collection write an event carries: `{ collection, id, record }`. `record` is the row (before the delete, for a delete). */
export interface CollectionEventPayload {
  collection: string;
  id: number;
  record: Record<string, unknown>;
}

export const COLLECTION_ACTIONS = ['created', 'updated', 'deleted'] as const;
export type CollectionAction = (typeof COLLECTION_ACTIONS)[number];

/** A custom event name: `orders.shipped`, `chat:message`. Short and plain, so it can be an SSE event name and a topic. */
export const EVENT_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

export class EventBus {
  private readonly listeners = new Set<EventListener>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  /** Calls `listener` for every event from now on. Returns the function that stops it. */
  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Publishes one event. A listener that throws never stops the others, or the write that caused the event. */
  emit(name: string, payload: unknown): void {
    if (this.listeners.size === 0) return;
    const event: BackendEvent = { name, payload, at: this.now().toISOString() };
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
        // A broken listener (a client that went away mid-write) must not undo or fail the data change.
      }
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * Whether an event name matches one of the patterns of an endpoint's `on` list. A pattern is a name (`products.created`),
 * a prefix with a trailing `*` (`products.*`) or `*` for everything. No regular expressions: nothing here can backtrack.
 */
export function matchesEvent(patterns: readonly string[], name: string): boolean {
  return patterns.some((pattern) => (pattern === '*' ? true : pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name));
}
