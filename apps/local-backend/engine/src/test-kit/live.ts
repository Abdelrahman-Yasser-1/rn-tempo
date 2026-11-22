import { request } from 'node:http';

import { WebSocket } from 'ws';

import type { SseEvent, TestSocket, TestStream } from './types.ts';

/**
 * The test kit's helpers for the realtime endpoints: thin wrappers that return async iterators, written with `node:http`
 * and `ws` so they work the same under any Jest environment (React Native's replaces `fetch` and `WebSocket`).
 */

const DEFAULT_WAIT_MS = 5000;

/** A queue that hands out items to a reader that may arrive before or after them, and ends when told. */
class Feed<T> {
  private readonly items: T[] = [];
  private readers: { resolve: (item: T | undefined) => void; timer: NodeJS.Timeout | undefined }[] = [];
  private finished = false;

  push(item: T): void {
    const reader = this.readers.shift();
    if (reader === undefined) this.items.push(item);
    else {
      clearTimeout(reader.timer);
      reader.resolve(item);
    }
  }

  end(): void {
    this.finished = true;
    for (const reader of this.readers.splice(0)) {
      clearTimeout(reader.timer);
      reader.resolve(undefined);
    }
  }

  /** The next item, `undefined` when the feed ended, and a rejection after `ms`. */
  next(ms: number, what: string): Promise<T | undefined> {
    const item = this.items.shift();
    if (item !== undefined) return Promise.resolve(item);
    if (this.finished) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      const reader = {
        resolve,
        timer: setTimeout(() => {
          this.readers = this.readers.filter((candidate) => candidate !== reader);
          reject(new Error(`No ${what} arrived within ${String(ms)} ms.`));
        }, ms),
      };
      this.readers.push(reader);
    });
  }
}

const toText = (data: Buffer | ArrayBuffer | Buffer[]): string => (Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer)).toString('utf8');

export interface SocketOptions {
  /** Subprotocols to offer (`['chat.v1']`). */
  protocols?: string[];
  /** A bearer token, sent as the `["bearer", token]` subprotocol pair (it never appears in the URL). */
  token?: string;
  headers?: Record<string, string>;
}

/** Opens a WebSocket on the backend. Resolves once it is open; rejects with the HTTP status when the upgrade is refused. */
export function openSocket(base: string, path: string, options: SocketOptions = {}): Promise<TestSocket> {
  const url = `${base.replace(/^http/, 'ws')}${path}`;
  const protocols = [...(options.protocols ?? []), ...(options.token === undefined ? [] : ['bearer', options.token])];
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, protocols, { ...(options.headers === undefined ? {} : { headers: options.headers }) });
    const feed = new Feed<string>();
    let closeCode: (code: number) => void = () => undefined;
    const closed = new Promise<number>((done) => {
      closeCode = done;
    });
    socket.on('message', (data) => feed.push(toText(data)));
    socket.on('close', (code) => {
      feed.end();
      closeCode(code);
    });
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      reject(new Error(`The server refused the WebSocket with status ${String(response.statusCode)}.`));
    });
    socket.on('error', () => undefined);
    socket.on('open', () => {
      const next = async (ms = DEFAULT_WAIT_MS): Promise<string> => {
        const message = await feed.next(ms, 'message');
        if (message === undefined) throw new Error('The WebSocket closed.');
        return message;
      };
      const live: TestSocket = {
        protocol: socket.protocol,
        send: (data) => socket.send(typeof data === 'string' ? data : JSON.stringify(data)),
        next,
        json: async <T>(ms?: number): Promise<T> => JSON.parse(await next(ms)) as T,
        closed,
        close: async () => {
          socket.close();
          await closed;
        },
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            const message = await feed.next(DEFAULT_WAIT_MS, 'message').catch(() => undefined);
            return message === undefined ? { value: undefined, done: true } : { value: message, done: false };
          },
          return: async () => {
            await live.close();
            return { value: undefined, done: true };
          },
        }),
      };
      resolve(live);
    });
  });
}

export interface StreamOptions {
  headers?: Record<string, string>;
  /** Resume from here (sent as `Last-Event-ID`). */
  lastEventId?: string | number;
}

/** Splits event-stream text into events by the WHATWG rules: a blank line ends an event, `:` starts a comment. */
function frames(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buffer;
  for (;;) {
    const end = /\r\n\r\n|\n\n|\r\r/.exec(rest);
    if (end === null) break;
    const block = rest.slice(0, end.index);
    rest = rest.slice(end.index + end[0].length);
    const lines: string[] = [];
    const event: SseEvent = { data: '' };
    for (const line of block.split(/\r\n|\n|\r/)) {
      if (line.startsWith(':')) continue;
      const at = line.indexOf(':');
      const name = at < 0 ? line : line.slice(0, at);
      const value = at < 0 ? '' : line.slice(at + 1).replace(/^ /, '');
      if (name === 'data') lines.push(value);
      else if (name === 'event') event.event = value;
      else if (name === 'id') event.id = value;
      else if (name === 'retry') event.retry = Number(value);
    }
    // An event with no data is not dispatched (a `retry:` hint, a comment).
    if (lines.length > 0) events.push({ ...event, data: lines.join('\n') });
  }
  return { events, rest };
}

/** Connects to an SSE endpoint. Resolves when the headers arrive; rejects with the status when the answer is not a stream. */
export function openStream(base: string, path: string, options: StreamOptions = {}): Promise<TestStream> {
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(`${base}${path}`),
      { method: 'GET', headers: { accept: 'text/event-stream', ...(options.lastEventId === undefined ? {} : { 'last-event-id': String(options.lastEventId) }), ...(options.headers ?? {}) } },
      (res) => {
        if (res.statusCode !== 200 || !String(res.headers['content-type'] ?? '').startsWith('text/event-stream')) {
          res.resume();
          return reject(new Error(`The server answered ${String(res.statusCode)} ${String(res.headers['content-type'] ?? '')} instead of an event stream.`));
        }
        const feed = new Feed<SseEvent>();
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          const parsed = frames(buffer);
          buffer = parsed.rest;
          for (const event of parsed.events) feed.push(event);
        });
        res.on('end', () => feed.end());
        res.on('close', () => feed.end());
        res.on('error', () => feed.end());
        const next = async (ms = DEFAULT_WAIT_MS): Promise<SseEvent> => {
          const event = await feed.next(ms, 'event');
          if (event === undefined) throw new Error('The event stream ended.');
          return event;
        };
        const live: TestStream = {
          next,
          json: async <T>(ms?: number): Promise<T> => JSON.parse((await next(ms)).data) as T,
          close: () => req.destroy(),
          [Symbol.asyncIterator]: () => ({
            next: async () => {
              const event = await feed.next(DEFAULT_WAIT_MS, 'event').catch(() => undefined);
              return event === undefined ? { value: undefined, done: true } : { value: event, done: false };
            },
            return: () => {
              req.destroy();
              return Promise.resolve({ value: undefined, done: true });
            },
          }),
        };
        resolve(live);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export interface GraphqlOptions {
  /** The endpoint's path (default `/graphql`). */
  path?: string;
  operationName?: string;
  /** A bearer token. */
  token?: string;
  headers?: Record<string, string>;
}

export interface GraphqlResult<T> {
  status: number;
  data: T | null | undefined;
  errors: { message: string; extensions?: Record<string, unknown> }[] | undefined;
}

/** One GraphQL operation over HTTP POST. A GraphQL error is in `errors`, not thrown: only a network failure rejects. */
export function postGraphql<T>(base: string, query: string, variables: Record<string, unknown> | undefined, options: GraphqlOptions = {}): Promise<GraphqlResult<T>> {
  const body = JSON.stringify({ query, ...(variables === undefined ? {} : { variables }), ...(options.operationName === undefined ? {} : { operationName: options.operationName }) });
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(`${base}${options.path ?? '/graphql'}`),
      { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)), ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }), ...(options.headers ?? {}) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { data?: T | null; errors?: GraphqlResult<T>['errors'] };
            resolve({ status: res.statusCode ?? 0, data: parsed.data, errors: parsed.errors });
          } catch {
            reject(new Error(`The GraphQL endpoint answered ${String(res.statusCode)} with something that is not JSON.`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
