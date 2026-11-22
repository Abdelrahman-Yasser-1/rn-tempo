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
  /** The requests the backend answered since the start or the last `reset()`, redacted (tokens and passwords are replaced). */
  requests(): RecordedRequest[];
  /** Back to the state at the start: data, media, users, scenarios, clock, sequences and recorded requests. */
  reset(): void;
}
