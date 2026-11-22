import { PassThrough } from 'node:stream';

import type { RequestCtx, Reply } from './http.ts';
import { problemReply } from './http.ts';
import { fill, PlaceholderError, type PlaceholderContext } from './placeholders.ts';
import type { Hub, Realtime, RealtimeClient } from './realtime.ts';
import type { Handler } from './router.ts';
import type { SseEndpoint } from './schema.ts';

/**
 * Server-Sent Events (WHATWG HTML, "Server-sent events"): `text/event-stream`, UTF-8, an event is a few `field: value` lines
 * and a blank line. `data` is split into one `data:` line per line of text, `id`, `event` and `retry` are single lines, and a
 * line that starts with `:` is a comment (the heartbeat). A client that reconnects sends `Last-Event-ID`.
 */

export interface SseFrame {
  id?: number | undefined;
  event?: string | undefined;
  data?: string | undefined;
  retry?: number | undefined;
}

/** Takes line breaks out of a single-line field (an event name cannot carry a second field). */
const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ');

/** One event as text, ending with the blank line. */
export function sseFrame(frame: SseFrame): string {
  let out = '';
  if (frame.retry !== undefined) out += `retry: ${String(frame.retry)}\n`;
  if (frame.id !== undefined) out += `id: ${String(frame.id)}\n`;
  if (frame.event !== undefined) out += `event: ${oneLine(frame.event)}\n`;
  if (frame.data !== undefined) for (const line of frame.data.split(/\r\n|\r|\n/)) out += `data: ${line}\n`;
  return `${out}\n`;
}

/** What goes on a `data:` line for a message: text as it is, anything else as JSON. */
export const sseData = (data: unknown): string => (typeof data === 'string' ? data : (JSON.stringify(data) ?? ''));

/** The most a slow client may have waiting before it is dropped. */
export const MAX_BUFFERED_BYTES = 1024 * 1024;

export interface SseDeps {
  realtime: Realtime;
  /** Whether delays are 0 for this request (test mode). */
  zeroed: (headers: RequestCtx['headers']) => boolean;
  now: () => Date;
}

class SseClient implements RealtimeClient {
  readonly id: string;
  readonly connectedAt: string;
  readonly ipHash: string;
  user: string | undefined;
  protocol: string | undefined;
  messagesIn = 0;
  messagesOut = 0;
  readonly stream = new PassThrough();
  private readonly hub: Hub;
  private closed = false;
  private readonly timers = new Set<NodeJS.Timeout>();
  private idle: NodeJS.Timeout | undefined;
  private readonly idleMs: number;
  private readonly onClosed: () => void;

  constructor(hub: Hub, id: string, ipHash: string, connectedAt: string, idleMs: number, onClosed: () => void) {
    this.hub = hub;
    this.id = id;
    this.ipHash = ipHash;
    this.connectedAt = connectedAt;
    this.idleMs = idleMs;
    this.onClosed = onClosed;
    this.stream.once('close', () => this.finish('disconnected'));
    this.touch();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** The timer of a delay or heartbeat, remembered so `close` can clear it. */
  timer(handle: NodeJS.Timeout): NodeJS.Timeout {
    this.timers.add(handle);
    return handle;
  }

  forget(handle: NodeJS.Timeout): void {
    clearTimeout(handle);
    this.timers.delete(handle);
  }

  /** Writes raw text. A client with too much waiting is dropped. */
  write(text: string): boolean {
    if (this.closed) return false;
    if (this.stream.writableLength > MAX_BUFFERED_BYTES) {
      this.finish('dropped: too slow');
      this.stream.end();
      return false;
    }
    this.stream.write(text);
    return true;
  }

  send(message: { event?: string | undefined; data: unknown }, id?: number): boolean {
    const data = sseData(message.data);
    const ok = this.write(sseFrame({ id, event: message.event, data }));
    if (ok) {
      this.messagesOut += 1;
      this.touch();
    }
    return ok;
  }

  /** The idle timeout counts from the last message (a heartbeat does not move it). */
  private touch(): void {
    if (this.idleMs <= 0 || this.closed) return;
    clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      this.finish('closed: idle');
      this.stream.end();
    }, this.idleMs);
    this.idle.unref();
  }

  close(): void {
    if (this.closed) return;
    this.finish('closed by the server');
    this.stream.end();
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const handle of this.timers) clearTimeout(handle);
    this.timers.clear();
    clearTimeout(this.idle);
    this.hub.remove(this, reason);
    this.onClosed();
  }
}

/** A wait that is cleared with the client. Zero waits only yield, so messages keep their order. */
function wait(client: SseClient, ms: number): Promise<void> {
  return new Promise((done) => {
    if (ms <= 0) return void setImmediate(done);
    const handle = client.timer(setTimeout(() => {
      client.forget(handle);
      done();
    }, ms));
  });
}

/** Runs the script of an endpoint for one client: each message after its delay, `repeat` times, with placeholders filled. */
async function runScript(client: SseClient, endpoint: SseEndpoint, values: PlaceholderContext, zeroed: boolean): Promise<void> {
  let count = 0;
  for (const message of endpoint.script) {
    for (let time = 0; time < (message.repeat ?? 1); time += 1) {
      await wait(client, zeroed ? 0 : (message.delayMs ?? 0));
      if (client.isClosed) return;
      count += 1;
      let data: unknown;
      try {
        data = fill(message.data, { ...values, seq: () => count });
      } catch (error) {
        if (!(error instanceof PlaceholderError)) throw error;
        data = { error: error.message };
      }
      if (!client.send({ event: message.event, data })) return;
    }
  }
}

/** The handler of an `sse` endpoint: opens the stream, registers the client in the hub and starts the script. */
export function sseHandler(endpoint: SseEndpoint, deps: SseDeps): Handler {
  return (ctx): Reply => {
    const hub = deps.realtime.hub(endpoint.id, 'sse');
    deps.realtime.track(endpoint);
    const ipHash = deps.realtime.hashIp(ctx.ip);
    const refused = hub.refusal(ipHash, endpoint);
    if (refused !== undefined) {
      const detail = refused === 'ip' ? `This address already holds ${String(endpoint.maxConnectionsPerIp)} connections to this endpoint.` : `This endpoint already has ${String(endpoint.maxConnections)} clients connected.`;
      return problemReply(429, { detail, headers: { 'retry-after': '5' } });
    }
    const client = new SseClient(hub, deps.realtime.newId(), ipHash, deps.now().toISOString(), endpoint.idleTimeoutMs, () => ctx.signal?.removeEventListener('abort', onAbort));
    function onAbort(): void {
      client.close();
    }
    client.user = ctx.user?.username;
    ctx.signal?.addEventListener('abort', onAbort, { once: true });
    hub.add(client);
    client.write(sseFrame({ retry: endpoint.retryMs }));
    if (endpoint.heartbeatMs > 0) {
      const beat = client.timer(setInterval(() => client.write(': keep-alive\n\n'), endpoint.heartbeatMs));
      beat.unref();
    }
    const last = Number(ctx.headers['last-event-id']);
    const resuming = Number.isInteger(last) && last > 0;
    if (resuming) {
      // A reconnecting client gets what it missed, not the script again.
      for (const missed of hub.missedSince(last)) client.send({ event: missed.event, data: missed.data }, missed.id);
    } else if (endpoint.script.length > 0 && ctx.values !== undefined) {
      const values = ctx.values;
      void runScript(client, endpoint, values, deps.zeroed(ctx.headers)).catch(() => client.close());
    }
    hub.log({ direction: 'system', clientId: client.id, text: resuming ? `resumed after ${String(last)}` : 'stream opened' });
    return {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' },
      stream: client.stream,
      live: true,
    };
  };
}
