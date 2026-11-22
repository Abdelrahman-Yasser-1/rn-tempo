import { redactDeep } from './redact.ts';

/** How many request entries the server keeps for a client that connects late. */
export const RING_SIZE = 500;
/** Largest body (as JSON text) kept per entry, in characters. A bigger one is cut and marked. */
export const MAX_BODY_CHARS = 32 * 1024;

export interface BodyView {
  /** Redacted. A string holding the first part of the JSON text when `truncated` is true. */
  body: unknown;
  truncated?: true;
}

export interface RequestEntry {
  /** Counts up from 1 for the life of the server; also the SSE event id. */
  id: number;
  at: string;
  method: string;
  /** The URL with sensitive query values redacted. */
  url: string;
  status: number;
  ms: number;
  scenario?: string;
  /** Network simulation of the Tempo Local Backend: what was applied to this request (absent when nothing was). */
  network?: NetworkNote;
  req: { headers: unknown } & BodyView;
  res: BodyView;
}

/** What the Tempo Local Backend's delay and throttle settings did to one request. */
export interface NetworkNote {
  /** Milliseconds the answer was held back before the endpoint ran (a timeout counts its whole wait). */
  delayMs?: number;
  /** Where the delay came from: `scenario`, `endpoint`, `default`, `preset` or `timeout`. */
  delaySource?: string;
  downloadKbps?: number;
  uploadKbps?: number;
  /** The connection was closed without an answer (the `timeout` preset). */
  timedOut?: true;
  /** Test mode zeroed the delays and throttling. */
  testMode?: true;
}

export interface EntryInput {
  method: string;
  url: string;
  status: number;
  ms: number;
  scenario?: string | undefined;
  network?: NetworkNote | undefined;
  reqHeaders: unknown;
  reqBody: unknown;
  resBody: unknown;
}

/** Redacts a body at any depth, then cuts it when its JSON text is longer than the cap. */
export function viewBody(value: unknown, max = MAX_BODY_CHARS): BodyView {
  const redacted = redactDeep(value);
  const text = redacted === undefined ? undefined : JSON.stringify(redacted);
  if (text === undefined || text.length <= max) return { body: redacted };
  return { body: text.slice(0, max), truncated: true };
}

/**
 * The last requests, kept in memory, plus the clients listening for new ones. Every entry is built
 * from redacted values, so nothing downstream (the SSE stream, a UI) ever sees a secret. `url` must
 * already be redacted by the caller (`redactUrl`).
 */
export class RequestLog {
  private readonly entries: RequestEntry[] = [];
  private readonly listeners = new Set<(entry: RequestEntry) => void>();
  private nextId = 1;

  private readonly size: number;

  constructor(size = RING_SIZE) {
    this.size = size;
  }

  record(input: EntryInput, now: Date = new Date()): RequestEntry {
    const req = viewBody(input.reqBody);
    const res = viewBody(input.resBody);
    const entry: RequestEntry = {
      id: this.nextId++,
      at: now.toISOString(),
      method: input.method,
      url: input.url,
      status: input.status,
      ms: input.ms,
      ...(input.scenario === undefined ? {} : { scenario: input.scenario }),
      ...(input.network === undefined ? {} : { network: input.network }),
      req: { headers: redactDeep(input.reqHeaders), ...req },
      res,
    };
    this.entries.push(entry);
    if (this.entries.length > this.size) this.entries.shift();
    for (const listener of this.listeners) listener(entry);
    return entry;
  }

  /** The kept entries, oldest first, optionally only those after an id. */
  snapshot(afterId = 0): RequestEntry[] {
    return this.entries.filter((entry) => entry.id > afterId);
  }

  /** Calls `listener` for each new entry. Returns the function that removes it. */
  subscribe(listener: (entry: RequestEntry) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
