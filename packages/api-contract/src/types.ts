import type { z } from 'zod';

/** HTTP methods an endpoint can use. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A canned response. Chosen per request with the `x-tempo-scenario` header or globally with
 * `tempo-api scenario set`. Fields that are left out fall back to the normal response.
 */
export interface Scenario {
  status?: number;
  /** Wait this long before answering, to test loading states. */
  delayMs?: number;
  /** Sent as the JSON body instead of the normal response (not checked against the schema). */
  body?: unknown;
}

/** One stored list of records, shared by all endpoints of a `resource`. */
export interface Collection {
  list<T = unknown>(): T[];
  get<T = unknown>(id: string | number): T | undefined;
  create<T = unknown>(item: Record<string, unknown>): T;
  update<T = unknown>(id: string | number, patch: Record<string, unknown>): T | undefined;
  remove<T = unknown>(id: string | number): T | undefined;
}

/**
 * The server's data store. Looked up by method rather than by property, because an unknown name
 * must be an error and index signatures hide that under `noUncheckedIndexedAccess`.
 */
export interface Db {
  /** Returns a resource's collection and throws when no `resource` has that name. */
  collection(name: string): Collection;
}

/** Node-style lowercase request headers. */
export type RequestHeaders = Readonly<Record<string, string | string[] | undefined>>;

/** Optional-schema helper: the parsed value of a schema, or a fallback when it is absent. */
type Parsed<S extends z.ZodType | undefined, Fallback> = S extends z.ZodType ? z.output<S> : Fallback;

/** What a `data` function receives, with every part typed from its schema. */
export interface DataContext<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
> {
  params: Parsed<P, Record<string, string>>;
  query: Parsed<Q, Record<string, unknown>>;
  body: Parsed<B, undefined>;
  db: Db;
  headers: RequestHeaders;
}

/** The context as the server builds it, before the typed view of `defineEndpoint`. */
export type AnyDataContext = DataContext<z.ZodType, z.ZodType, z.ZodType>;

/** Ties an endpoint to a `resource` so the server can create and seed its collection. */
export interface ResourceBinding {
  readonly name: string;
  readonly op: 'list' | 'get' | 'create' | 'update' | 'delete';
  readonly idField: string;
  readonly schema: z.ZodType;
  /** A count of items to generate, or the items themselves. */
  readonly seed: number | readonly Record<string, unknown>[];
  readonly searchBy: readonly string[];
}

/** A validated endpoint, as `defineEndpoint` returns it. */
export interface EndpointDefinition<
  P extends z.ZodType | undefined = z.ZodType | undefined,
  Q extends z.ZodType | undefined = z.ZodType | undefined,
  B extends z.ZodType | undefined = z.ZodType | undefined,
  R extends z.ZodType = z.ZodType,
> {
  /** Stable id, `<method>.<path>` unless set explicitly. Used by scenarios and fixtures. */
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly params?: P;
  readonly query?: Q;
  readonly body?: B;
  readonly response: R;
  readonly status: number;
  readonly auth?: 'bearer';
  readonly data?: (ctx: AnyDataContext) => unknown;
  readonly scenarios: Readonly<Record<string, Scenario>>;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly resource?: ResourceBinding;
}
