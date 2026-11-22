/** A request the backend answered, with secrets replaced. */
export interface RecordedRequest {
  id: number;
  at: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  scenario?: string;
  req: { headers: unknown; body: unknown; truncated?: true };
  res: { body: unknown; truncated?: true };
}

/**
 * The Tempo test kit: starts a backend in the Jest process, on `127.0.0.1` and a random port, from a downloaded or a
 * committed definition, with the database in memory and test mode on. Node only: nothing here touches React Native.
 */
export interface TempoBackendOptions {
  /** A backend URL (`https://host/b/name`) or a backend folder. Default: `TEMPO_BACKEND`, then `./backend`. */
  source?: string;
  /** A `read-definition` key for a URL source. Default: `TEMPO_BACKEND_KEY`. */
  apiKey?: string;
  /** Default `node_modules/.cache/tempo-backend`. */
  cacheDir?: string;
  /** No delays or random faults, a fixed clock and seed (default true). A request opts back in to delays with `x-tempo-test-delays: 1`. */
  testMode?: boolean;
  /** `file`: a fresh copy per test file (default). `test`: also reset before each test. */
  isolate?: 'file' | 'test';
  /** Where warnings go (default: a line on stderr). */
  warn?: (message: string) => void;
  /**
   * The port to listen on (default 0: a free one). A project that must know the address before the backend starts (a
   * module that reads its base URL when it is imported) picks a free port itself and passes it here.
   */
  port?: number;
  /** Register `beforeAll`/`afterAll` when Jest's globals exist (default true). Turn it off to call `start()` and `stop()` yourself. */
  hooks?: boolean;
}

export interface TempoBackend {
  /** `http://127.0.0.1:<port>`. Empty until `start()` has finished (Jest's `beforeAll` of the kit runs it). */
  readonly url: string;
  /** Where the definition came from, once started. */
  readonly loaded: 'folder' | 'download' | 'not-modified' | 'cache' | undefined;
  /** Milliseconds the last `start()` took (reading the definition, starting the engine, loading the data). */
  readonly startMs: number | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Pick a scenario for an endpoint (`getProduct`, `notFound`) until `clearScenarios()`. */
  scenario(endpointId: string, name: string): void;
  clearScenarios(): void;
  /** The clock `{{now}}` and every timestamp the backend writes show. */
  time: { set(value: string | number | Date): void; reset(): void };
  data: {
    insert(collection: string, values: Record<string, unknown>): Record<string, unknown>;
    list(collection: string): Record<string, unknown>[];
    get(collection: string, id: number): Record<string, unknown> | undefined;
    remove(collection: string, id: number): boolean;
  };
  /** Data change events (`products.created`, `content.published`, a handler's `ctx.emit`), published after each write commits. Returns the function that stops listening. */
  events: { on(listener: (event: { name: string; payload: unknown; at: string }) => void): () => void };
  /** Opens a WebSocket on a `websocket` endpoint (or the subscriptions of a `graphql` one: offer `protocols: ['graphql-transport-ws']`). A token goes in the subprotocol, never the URL. */
  ws(path: string, options?: { protocols?: string[]; token?: string; headers?: Record<string, string> }): Promise<TestSocket>;
  /** Opens an event stream on an `sse` endpoint. */
  sse(path: string, options?: { headers?: Record<string, string>; lastEventId?: string | number }): Promise<TestStream>;
  /** Runs one GraphQL operation over HTTP. GraphQL errors come back in `errors`. */
  graphql<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>,
    options?: { path?: string; operationName?: string; token?: string; headers?: Record<string, string> },
  ): Promise<{ status: number; data: T | null | undefined; errors: { message: string; extensions?: Record<string, unknown> }[] | undefined }>;
  /** Outgoing webhooks. In test mode a delivery is captured (signed, as it would be sent), never sent. */
  webhooks: {
    /** The captured deliveries since the start or the last `reset()`. */
    deliveries(): { id: string; webhookId: string; event: string; url: string; headers: Record<string, string>; body: string; json: unknown }[];
  };
  /** The requests the backend answered since the start or the last `reset()`, redacted (tokens and passwords are replaced). */
  requests(): RecordedRequest[];
  /** Back to the state at the start: data, media, users, scenarios, clock, sequences and recorded requests. */
  reset(): void;
}

/** One server-sent event as the test kit parses it. `data` is the lines joined with `\n`. */
export interface SseEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

/** An open event stream: read it with `next()`, or `for await`. */
export interface TestStream extends AsyncIterable<SseEvent> {
  /** The next event. Rejects after `ms` (default 5000) or when the stream ends. */
  next(ms?: number): Promise<SseEvent>;
  /** The next event's data as JSON. */
  json<T = unknown>(ms?: number): Promise<T>;
  close(): void;
}

/** An open WebSocket: `send`, then read with `next()` or `for await`. */
export interface TestSocket extends AsyncIterable<string> {
  /** The subprotocol the server chose. */
  readonly protocol: string;
  send(data: string | object): void;
  next(ms?: number): Promise<string>;
  json<T = unknown>(ms?: number): Promise<T>;
  /** Resolves with the close code once the socket is closed. */
  readonly closed: Promise<number>;
  close(): Promise<void>;
}
