import type { IncomingMessage as HttpRequest } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocket, WebSocketServer, type RawData } from 'ws';

import { fill, PlaceholderError, type PlaceholderContext } from './placeholders.ts';
import { logText, redactedText, type Hub, type RealtimeClient } from './realtime.ts';
import type { WebsocketEndpoint } from './schema.ts';
import { matchesRule } from './ws-rules.ts';

/**
 * WebSocket endpoints on the public listener (HTTP Upgrade). Node has a WebSocket client built in but no server, so this
 * uses `ws` (pure JavaScript; its optional native add-ons are not installed). The upgrade is checked here first (access key,
 * bearer token, limits), so a refused client gets a plain HTTP answer and never a WebSocket.
 */

/** The subprotocol a client offers to carry a bearer token: `new WebSocket(url, ['bearer', token])`. */
export const BEARER_PROTOCOL = 'bearer';

/** The protocols of a `Sec-WebSocket-Protocol` header, in the order offered. */
export function offeredProtocols(header: string | string[] | undefined): string[] {
  const text = Array.isArray(header) ? header.join(',') : (header ?? '');
  return text.split(',').map((item) => item.trim()).filter((item) => item !== '');
}

/**
 * The bearer token a client sent, and where: the `Authorization` header, a `["bearer", "<token>"]` subprotocol pair (or
 * `bearer.<token>`), or `?token=` / `?access_token=` in the URL. The subprotocol is the one to prefer, since a URL ends up
 * in proxy logs; the query form exists for clients that cannot set either.
 */
export function bearerFrom(headers: HttpRequest['headers'], query: URLSearchParams): { token: string; via: 'header' | 'subprotocol' | 'query' } | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(String(headers.authorization ?? ''));
  if (match?.[1] !== undefined) return { token: match[1], via: 'header' };
  const offered = offeredProtocols(headers['sec-websocket-protocol']);
  const at = offered.indexOf(BEARER_PROTOCOL);
  const following = at >= 0 ? offered[at + 1] : undefined;
  if (following !== undefined) return { token: following, via: 'subprotocol' };
  const dotted = offered.find((item) => item.startsWith(`${BEARER_PROTOCOL}.`));
  if (dotted !== undefined) return { token: dotted.slice(BEARER_PROTOCOL.length + 1), via: 'subprotocol' };
  const queried = query.get('token') ?? query.get('access_token');
  return queried === null || queried === '' ? undefined : { token: queried, via: 'query' };
}

/** The offered protocols without the token that rides in them, for logs. */
export function protocolsForLog(header: string | string[] | undefined): string {
  const offered = offeredProtocols(header);
  const at = offered.indexOf(BEARER_PROTOCOL);
  return offered.map((item, index) => (index === at + 1 && at >= 0 ? '[REDACTED]' : item.startsWith(`${BEARER_PROTOCOL}.`) ? `${BEARER_PROTOCOL}.[REDACTED]` : item)).join(', ');
}

/** The subprotocol to answer with, or `false` for none. Never the token itself. */
export function chooseProtocol(offered: readonly string[], supported: readonly string[], speaksBearer: boolean): string | false {
  const at = offered.indexOf(BEARER_PROTOCOL);
  const tokens = new Set<string>();
  if (at >= 0 && offered[at + 1] !== undefined) tokens.add(offered[at + 1] ?? '');
  const candidates = offered.filter((item) => !tokens.has(item) && !item.startsWith(`${BEARER_PROTOCOL}.`));
  const own = candidates.find((item) => supported.includes(item));
  if (own !== undefined) return own;
  if (supported.length === 0) {
    const first = candidates.find((item) => item !== BEARER_PROTOCOL) ?? (candidates.includes(BEARER_PROTOCOL) ? BEARER_PROTOCOL : undefined);
    return first ?? false;
  }
  return candidates.includes(BEARER_PROTOCOL) && speaksBearer ? BEARER_PROTOCOL : false;
}

/** Answers an upgrade request with a plain HTTP error and closes the socket. */
export function refuseUpgrade(socket: Duplex, status: number, reason: string, headers: Record<string, string> = {}): void {
  const body = JSON.stringify({ type: 'about:blank', title: reason, status, detail: reason, message: reason });
  const lines = [`HTTP/1.1 ${String(status)} ${reason.replace(/[\r\n]/g, ' ').slice(0, 60)}`, 'Connection: close', 'Content-Type: application/problem+json', `Content-Length: ${String(Buffer.byteLength(body))}`];
  for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
  if (!socket.destroyed) socket.write(`${lines.join('\r\n')}\r\n\r\n${body}`);
  socket.destroy();
}

/** The text of a frame, and whether it was binary. */
function textOf(data: RawData, binary: boolean): string {
  if (binary) return '';
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]).toString('utf8');
}

const toBuffer = (data: RawData): Buffer => (Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]));

/** The bytes of a raw frame. */
const sizeOf = (data: RawData): number => (Array.isArray(data) ? data.reduce((sum, part) => sum + part.length, 0) : data.byteLength);

export interface LiveLogEntry {
  endpointId: string;
  url: string;
  status: number;
  ms: number;
  headers?: unknown;
  reqBody?: unknown;
  resBody?: unknown;
  operation?: string;
}

/** What a live connection needs from the engine. */
export interface LiveDeps {
  now: () => Date;
  /** Records a connect, a message or a disconnect in the request log and the stats. */
  record: (entry: LiveLogEntry) => void;
  /** Whether delays are 0 for this connection (test mode). */
  zeroed: boolean;
}

/**
 * One connected client of a WebSocket endpoint (a plain one or a GraphQL subscriptions connection). It owns its timers (the
 * keepalive ping and the waits of delayed replies) and clears them when the socket closes.
 */
export class LiveSocket implements RealtimeClient {
  readonly id: string;
  readonly connectedAt: string;
  readonly ipHash: string;
  user: string | undefined;
  protocol: string | undefined;
  messagesIn = 0;
  messagesOut = 0;
  readonly socket: WebSocket;
  private readonly timers = new Set<NodeJS.Timeout>();
  private alive = true;
  private closed = false;
  private readonly maxBuffered: number;
  private readonly hub: Hub;
  private onGone: (() => void) | undefined;

  constructor(socket: WebSocket, hub: Hub, init: { id: string; ipHash: string; connectedAt: string; maxBuffered: number; pingIntervalMs: number }) {
    this.socket = socket;
    this.hub = hub;
    this.id = init.id;
    this.ipHash = init.ipHash;
    this.connectedAt = init.connectedAt;
    this.maxBuffered = init.maxBuffered;
    socket.on('pong', () => {
      this.alive = true;
    });
    socket.once('close', () => this.gone('disconnected'));
    // An error always ends in `close`; listening keeps it from crashing the process.
    socket.on('error', () => undefined);
    if (init.pingIntervalMs > 0) {
      const timer = setInterval(() => {
        if (!this.alive) {
          this.hub.log({ direction: 'system', clientId: this.id, text: 'no pong: dropped' });
          socket.terminate();
          return;
        }
        this.alive = false;
        socket.ping();
      }, init.pingIntervalMs);
      timer.unref();
      this.timers.add(timer);
    }
  }

  get isClosed(): boolean {
    return this.closed || this.socket.readyState !== WebSocket.OPEN;
  }

  /** Runs `callback` once when the socket is gone. */
  whenGone(callback: () => void): void {
    this.onGone = callback;
  }

  /** A timer that dies with the socket. */
  after(ms: number, task: () => void): void {
    if (ms <= 0) return void setImmediate(() => !this.isClosed && task());
    const handle = setTimeout(() => {
      this.timers.delete(handle);
      if (!this.isClosed) task();
    }, ms);
    this.timers.add(handle);
  }

  /** Sends text. A client with too much waiting is closed with 1013 ("try again later"). */
  sendText(text: string): boolean {
    if (this.isClosed) return false;
    if (this.socket.bufferedAmount > this.maxBuffered) {
      this.hub.log({ direction: 'system', clientId: this.id, text: 'too slow: closed' });
      this.close(1013, 'Too slow');
      return false;
    }
    this.socket.send(text);
    this.messagesOut += 1;
    return true;
  }

  send(message: { event?: string | undefined; data: unknown }): boolean {
    const payload = message.event === undefined ? message.data : { event: message.event, data: message.data };
    return this.sendText(typeof payload === 'string' ? payload : (JSON.stringify(payload) ?? ''));
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      try {
        this.socket.close(code, reason.slice(0, 100));
      } catch {
        this.socket.terminate();
      }
      // A client that does not answer the close handshake is cut off.
      const force = setTimeout(() => this.socket.terminate(), 1000);
      force.unref();
      this.timers.add(force);
    }
  }

  private gone(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const handle of this.timers) clearTimeout(handle);
    this.timers.clear();
    this.hub.remove(this, reason);
    this.onGone?.();
  }
}

export interface AcceptInput {
  req: HttpRequest;
  socket: Duplex;
  head: Buffer;
  endpoint: WebsocketEndpoint;
  hub: Hub;
  ipHash: string;
  clientId: string;
  user: string | undefined;
  /** Placeholders of the connection (the request, the user). */
  values: PlaceholderContext;
  url: string;
  deps: LiveDeps;
  /** Headers as the log may show them (the subprotocol token already replaced). */
  logHeaders: unknown;
}

/** The sockets of the websocket endpoints: one `ws` server per endpoint, made when the first client comes. */
export class WebSocketService {
  private readonly servers = new Map<string, { wss: WebSocketServer; signature: string }>();

  private serverFor(endpoint: WebsocketEndpoint): WebSocketServer {
    const signature = JSON.stringify([endpoint.maxPayloadBytes, endpoint.subprotocols, endpoint.auth]);
    const found = this.servers.get(endpoint.id);
    if (found?.signature === signature) return found.wss;
    found?.wss.close();
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: endpoint.maxPayloadBytes,
      // Compression costs memory per client and a mock has no use for it.
      perMessageDeflate: false,
      handleProtocols: (offered) => chooseProtocol([...offered], endpoint.subprotocols, endpoint.auth === 'bearer'),
    });
    this.servers.set(endpoint.id, { wss, signature });
    return wss;
  }

  /** Upgrades the request and runs the endpoint's behaviour for the new client. */
  accept(input: AcceptInput): void {
    const { endpoint, hub, deps } = input;
    const wss = this.serverFor(endpoint);
    wss.handleUpgrade(input.req, input.socket, input.head, (ws) => {
      const client = new LiveSocket(ws, hub, { id: input.clientId, ipHash: input.ipHash, connectedAt: deps.now().toISOString(), maxBuffered: endpoint.maxBufferedBytes, pingIntervalMs: endpoint.pingIntervalMs });
      client.user = input.user;
      client.protocol = ws.protocol === '' ? undefined : ws.protocol;
      const started = Date.now();
      hub.add(client);
      deps.record({ endpointId: endpoint.id, url: input.url, status: 101, ms: 0, headers: input.logHeaders, resBody: { event: 'connect', client: client.id, ...(client.protocol === undefined ? {} : { protocol: client.protocol }) } });
      client.whenGone(() => deps.record({ endpointId: endpoint.id, url: input.url, status: 200, ms: Date.now() - started, resBody: { event: 'disconnect', client: client.id } }));
      let counter = 0;
      const valuesFor = (message?: unknown): PlaceholderContext => ({ ...input.values, seq: () => counter, ...(message === undefined ? {} : { vars: { message } }) });
      const fillSafe = (value: unknown, values: PlaceholderContext): unknown => {
        try {
          return fill(value, values);
        } catch (error) {
          if (!(error instanceof PlaceholderError)) throw error;
          return { error: error.message };
        }
      };
      if (endpoint.onConnect !== undefined) {
        counter += 1;
        client.send({ data: fillSafe(endpoint.onConnect, valuesFor()) });
      }
      ws.on('message', (data: RawData, isBinary: boolean) => {
        client.messagesIn += 1;
        const text = textOf(data, isBinary);
        const incoming = isBinary ? `[binary, ${String(sizeOf(data))} bytes]` : text;
        hub.log({ direction: 'in', clientId: client.id, text: logText(incoming) });
        const shown = typeof incoming === 'string' ? redactedText(incoming.slice(0, 8192)) : incoming;
        const replies: unknown[] = [];
        const reply = (value: unknown, broadcast: boolean): void => {
          replies.push(value);
          hub.log({ direction: 'out', ...(broadcast ? {} : { clientId: client.id }), text: logText(value) });
          if (broadcast) hub.broadcast({ data: value });
          else client.send({ data: value });
        };
        const finish = (): void =>
          deps.record({ endpointId: endpoint.id, url: input.url, status: 200, ms: 0, reqBody: shown, ...(replies.length === 0 ? {} : { resBody: replies.length === 1 ? (typeof replies[0] === 'string' ? redactedText(replies[0].slice(0, 8192)) : replies[0]) : replies }) });
        if (endpoint.behavior === 'echo') {
          if (isBinary) {
            if (!client.isClosed) {
              ws.send(toBuffer(data), { binary: true });
              client.messagesOut += 1;
            }
            replies.push(incoming);
          } else reply(text, false);
          return finish();
        }
        if (isBinary) return finish();
        let json: { value: unknown } | undefined;
        try {
          json = { value: JSON.parse(text) as unknown };
        } catch {
          json = undefined;
        }
        const rule = endpoint.rules.find((candidate) => matchesRule(candidate.match, { text, json }));
        if (rule === undefined) return finish();
        counter += 1;
        const answer = fillSafe(rule.reply, valuesFor(json === undefined ? text : json.value));
        client.after(deps.zeroed ? 0 : (rule.delayMs ?? 0), () => {
          reply(answer, rule.broadcast === true);
          finish();
        });
      });
    });
  }

  close(): void {
    for (const { wss } of this.servers.values()) wss.close();
    this.servers.clear();
  }
}
