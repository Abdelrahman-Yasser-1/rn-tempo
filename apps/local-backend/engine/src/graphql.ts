import {
  execute,
  GraphQLError,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  subscribe,
  validate,
  type DocumentNode,
  type ExecutionResult,
  type FragmentDefinitionNode,
  type GraphQLFieldResolver,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql';

import type { AuthUser } from './accounts.ts';
import type { BackendEvent, EventBus } from './events.ts';
import type { RunResult } from './handlers.ts';
import { jsonReply, type Reply, type RequestCtx } from './http.ts';
import { fill, PlaceholderError, type PlaceholderContext } from './placeholders.ts';
import { publicPayload } from './realtime.ts';
import type { Backend, Collection } from './schema.ts';
import { UniqueViolationError, type ListQuery, type Store } from './store.ts';
import { isPlainObject, validateRecord } from './values.ts';
import type { GraphqlModel, ResolverSpec } from './graphql-schema.ts';

/**
 * Running GraphQL operations for one endpoint with the reference `graphql` package.
 *
 * Every operation goes through the same guarded steps: the query text is limited in size, parsed, measured (depth and field
 * count, with fragments expanded and cut off at the limit), validated (introspection can be switched off), checked for the
 * operations that need a signed-in user, and only then executed. Batching is not supported, and a subscription needs a
 * WebSocket (see `graphql-ws.ts`).
 */

export interface GraphqlLimits {
  maxDepth: number;
  maxFields: number;
  maxQueryBytes: number;
  introspection: boolean;
  /** `Query.x`, `Mutation.y`: operations that need a signed-in user even when the endpoint itself is open. */
  requireAuth: readonly string[];
}

/** What a resolver can see of the request (or of the WebSocket connection) it runs for. */
export interface GqlContext {
  request: RequestCtx;
  user: AuthUser | undefined;
  values: PlaceholderContext;
}

export interface GraphqlDeps {
  store: Store;
  definition: () => Backend;
  events: EventBus;
  mediaExists: (id: string) => boolean;
  /** The fields of a collection that must not be read, filtered on or sorted by (hidden by a crud endpoint or by this endpoint). */
  hidden: (collection: string) => ReadonlySet<string>;
  /** Runs a handler file as a field resolver. */
  callHandler: (file: string, label: string, context: GqlContext, body: unknown) => Promise<RunResult>;
}

export interface Prepared {
  document: DocumentNode;
  operation: OperationDefinitionNode;
  /** The operation's name, or `anonymous`. */
  name: string;
  type: 'query' | 'mutation' | 'subscription';
  /** The fields the operation selects at its root, fragments followed. */
  rootFields: string[];
}

export interface RequestError {
  message: string;
  locations?: unknown;
  extensions?: Record<string, unknown>;
}

export type PrepareResult = { ok: true; prepared: Prepared } | { ok: false; status: number; errors: RequestError[] };

const failure = (status: number, message: string, code: string): PrepareResult => ({ ok: false, status, errors: [{ message, extensions: { code } }] });

interface Measure {
  fields: number;
  depth: number;
  rootFields: string[];
  problem: string | undefined;
}

/**
 * Counts the fields of an operation (every use of a fragment counts again, as it will execute again) and finds its deepest
 * nesting. It stops as soon as a limit is passed, so a query made to explode through fragments costs the limit, not its size.
 * What hangs under `__schema` and `__type` is the schema's own and is left out (validation bounds it separately).
 */
export function measure(operation: OperationDefinitionNode, fragments: ReadonlyMap<string, FragmentDefinitionNode>, limits: Pick<GraphqlLimits, 'maxDepth' | 'maxFields'>): Measure {
  const result: Measure = { fields: 0, depth: 0, rootFields: [], problem: undefined };
  const walk = (set: SelectionSetNode, depth: number, active: readonly string[]): void => {
    if (result.problem !== undefined) return;
    for (const selection of set.selections) {
      if (result.problem !== undefined) return;
      if (selection.kind === 'Field') {
        result.fields += 1;
        result.depth = Math.max(result.depth, depth);
        if (depth === 1) result.rootFields.push(selection.name.value);
        if (depth > limits.maxDepth) return void (result.problem = `The query is nested ${String(depth)} levels deep; the limit is ${String(limits.maxDepth)}.`);
        if (result.fields > limits.maxFields) return void (result.problem = `The query selects more than ${String(limits.maxFields)} fields.`);
        if (selection.selectionSet !== undefined && !(depth === 1 && (selection.name.value === '__schema' || selection.name.value === '__type'))) walk(selection.selectionSet, depth + 1, active);
      } else if (selection.kind === 'InlineFragment') {
        walk(selection.selectionSet, depth, active);
      } else {
        const name = selection.name.value;
        const fragment = fragments.get(name);
        // A cycle is reported by validation; here it only must not loop.
        if (fragment !== undefined && !active.includes(name)) walk(fragment.selectionSet, depth, [...active, name]);
      }
    }
  };
  walk(operation.selectionSet, 1, []);
  return result;
}

/** Parses, measures and validates a query against the schema. Nothing runs yet. */
export function prepare(model: GraphqlModel, limits: GraphqlLimits, payload: { query: string; operationName?: string | undefined }): PrepareResult {
  if (Buffer.byteLength(payload.query) > limits.maxQueryBytes) return failure(413, `The query is larger than ${String(limits.maxQueryBytes)} bytes.`, 'QUERY_TOO_LARGE');
  let document: DocumentNode;
  try {
    document = parse(payload.query, { maxTokens: 20_000 });
  } catch (error) {
    return { ok: false, status: 400, errors: [error instanceof GraphQLError ? (error.toJSON() as RequestError) : { message: 'The query could not be read.' }] };
  }
  const operations = document.definitions.filter((definition): definition is OperationDefinitionNode => definition.kind === 'OperationDefinition');
  const fragments = new Map(document.definitions.filter((definition): definition is FragmentDefinitionNode => definition.kind === 'FragmentDefinition').map((fragment) => [fragment.name.value, fragment]));
  let operation: OperationDefinitionNode | undefined;
  if (payload.operationName !== undefined && payload.operationName !== '') {
    operation = operations.find((candidate) => candidate.name?.value === payload.operationName);
    if (operation === undefined) return failure(400, `Unknown operation named "${payload.operationName}".`, 'BAD_REQUEST');
  } else if (operations.length === 1) operation = operations[0];
  else return failure(400, operations.length === 0 ? 'The query has no operation.' : 'Must provide operationName if the query contains multiple operations.', 'BAD_REQUEST');
  if (operation === undefined) return failure(400, 'The query has no operation.', 'BAD_REQUEST');
  const size = measure(operation, fragments, limits);
  if (size.problem !== undefined) return failure(400, size.problem, 'QUERY_TOO_COMPLEX');
  const problems = validate(model.schema, document, limits.introspection ? specifiedRules : [...specifiedRules, NoSchemaIntrospectionCustomRule]);
  if (problems.length > 0) return { ok: false, status: 400, errors: problems.map((problem) => problem.toJSON() as RequestError) };
  return { ok: true, prepared: { document, operation, name: (operation.name?.value ?? 'anonymous').slice(0, 100), type: operation.operation, rootFields: size.rootFields } };
}

/** The root fields of an operation that need a signed-in user, as `Query.x`. */
export function needsSignIn(prepared: Prepared, limits: Pick<GraphqlLimits, 'requireAuth'>): string[] {
  const root = prepared.type === 'query' ? 'Query' : prepared.type === 'mutation' ? 'Mutation' : 'Subscription';
  return prepared.rootFields.map((field) => `${root}.${field}`).filter((key) => limits.requireAuth.includes(key));
}

/** The variables of a request: an object, or none. */
export function variablesOf(value: unknown): Record<string, unknown> | undefined {
  return isPlainObject(value) ? value : undefined;
}

// ---- resolvers

const unauthorized = (): GraphQLError => new GraphQLError('You must sign in.', { extensions: { code: 'UNAUTHENTICATED' } });

const whole = (value: unknown, fallback: number, max: number): number => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback);

/** A source of events as an async iterator that can be stopped at any moment (also while it waits). */
export function eventIterator<T>(events: EventBus, pick: (event: BackendEvent) => T | undefined): AsyncGenerator<T, void, void> {
  const queue: T[] = [];
  let waiting: ((result: IteratorResult<T, void>) => void) | undefined;
  let done = false;
  const stop = events.on((event) => {
    if (done) return;
    const value = pick(event);
    if (value === undefined) return;
    if (waiting !== undefined) {
      const resolve = waiting;
      waiting = undefined;
      resolve({ value, done: false });
    } else {
      queue.push(value);
      if (queue.length > 1000) queue.shift();
    }
  });
  const finish = (): Promise<IteratorResult<T, void>> => {
    done = true;
    stop();
    queue.length = 0;
    const resolve = waiting;
    waiting = undefined;
    resolve?.({ value: undefined, done: true });
    return Promise.resolve({ value: undefined, done: true });
  };
  const iterator: AsyncGenerator<T, void, void> = {
    next: () => {
      const value = queue.shift();
      if (value !== undefined) return Promise.resolve({ value, done: false });
      if (done) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    return: finish,
    throw: (error: unknown) => finish().then(() => Promise.reject(error instanceof Error ? error : new Error(String(error)))),
    [Symbol.asyncIterator]: () => iterator,
    [Symbol.asyncDispose]: async () => void (await finish()),
  };
  return iterator;
}

export class GraphqlRuntime {
  readonly model: GraphqlModel;
  readonly limits: GraphqlLimits;
  private readonly deps: GraphqlDeps;
  private readonly label: string;

  constructor(model: GraphqlModel, limits: GraphqlLimits, deps: GraphqlDeps, label: string) {
    this.model = model;
    this.limits = limits;
    this.deps = deps;
    this.label = label;
  }

  private collectionOf(name: string): Collection {
    const found = this.deps.definition().collections.find((collection) => collection.name === name);
    if (found === undefined) throw new GraphQLError(`The collection "${name}" no longer exists.`);
    return found;
  }

  private async resolveSpec(spec: ResolverSpec, source: unknown, args: Record<string, unknown>, context: GqlContext, field: string): Promise<unknown> {
    switch (spec.kind) {
      case 'static': {
        try {
          return fill(spec.value, { ...context.values, vars: { args, parent: source } });
        } catch (error) {
          if (error instanceof PlaceholderError) throw new GraphQLError(error.message);
          throw error;
        }
      }
      case 'handler': {
        const result = await this.deps.callHandler(spec.file, `${this.label} ${field}`, context, { field, args, parent: source });
        if (result.kind === 'ok') return result.value;
        throw new GraphQLError(result.kind === 'timeout' ? 'The handler took too long and was stopped.' : `The handler failed: ${result.message}`, { extensions: { code: 'HANDLER_FAILED' } });
      }
      case 'event':
        // The event's value is the source of the field (see `subscribeSpec`).
        return source;
      case 'collection':
        return this.resolveCollection(this.collectionOf(spec.collection), spec.action, args);
    }
  }

  private resolveCollection(collection: Collection, action: 'list' | 'get' | 'create' | 'update' | 'delete', args: Record<string, unknown>): unknown {
    const { store } = this.deps;
    const hidden = this.deps.hidden(collection.name);
    // A hidden field answers like one that does not exist: ordering or filtering by it would leak its values.
    const names = new Map(collection.fields.filter((field) => !hidden.has(field.name)).map((field) => [field.name, field]));
    const id = typeof args.id === 'number' && Number.isInteger(args.id) && args.id > 0 ? args.id : undefined;
    try {
      switch (action) {
        case 'list': {
          const where: NonNullable<ListQuery['where']> = [];
          for (const [key, value] of Object.entries(isPlainObject(args.where) ? args.where : {})) {
            if (value === null || value === undefined) continue;
            if (key !== 'id' && !names.has(key)) throw new GraphQLError(`The collection ${collection.name} has no field "${key}".`, { extensions: { code: 'BAD_USER_INPUT' } });
            if (typeof value === 'boolean') where.push({ field: key, value: value ? 1 : 0 });
            else if (typeof value === 'string' || typeof value === 'number') where.push({ field: key, value });
            else throw new GraphQLError(`The filter on "${key}" must be text, a number or true/false.`, { extensions: { code: 'BAD_USER_INPUT' } });
          }
          const sort: NonNullable<ListQuery['sort']> = [];
          if (typeof args.sort === 'string' && args.sort !== '') {
            for (const part of args.sort.split(',')) {
              const name = part.replace(/^-/, '');
              if (name !== 'id' && !names.has(name)) throw new GraphQLError(`Cannot sort by "${name}".`, { extensions: { code: 'BAD_USER_INPUT' } });
              sort.push({ field: name, desc: part.startsWith('-') });
            }
          }
          const limit = whole(args.limit, 30, 1000);
          return store.list(collection.name, { where, sort, limit: limit === 0 ? 1000 : limit, skip: whole(args.skip, 0, 1_000_000) }).rows;
        }
        case 'get':
          return id === undefined ? null : (store.get(collection.name, id) ?? null);
        case 'create': {
          const checked = validateRecord(collection, args.input, { mode: 'create', unknownFields: 'reject', part: 'input', exists: (name, rowId) => store.has(name, rowId), mediaExists: this.deps.mediaExists });
          if (checked.issues.length > 0) throw new GraphQLError(`${checked.issues[0]?.path ?? 'input'}: ${checked.issues[0]?.message ?? 'Invalid.'}`, { extensions: { code: 'BAD_USER_INPUT', errors: checked.issues } });
          return store.insert(collection.name, checked.values);
        }
        case 'update': {
          if (id === undefined || !store.has(collection.name, id)) return null;
          const checked = validateRecord(collection, args.input, { mode: 'patch', unknownFields: 'reject', part: 'input', exists: (name, rowId) => store.has(name, rowId), mediaExists: this.deps.mediaExists });
          if (checked.issues.length > 0) throw new GraphQLError(`${checked.issues[0]?.path ?? 'input'}: ${checked.issues[0]?.message ?? 'Invalid.'}`, { extensions: { code: 'BAD_USER_INPUT', errors: checked.issues } });
          return store.update(collection.name, id, checked.values) ?? null;
        }
        case 'delete': {
          const row = id === undefined ? undefined : store.get(collection.name, id);
          if (id === undefined || row === undefined) return null;
          store.remove(collection.name, id);
          return row;
        }
      }
    } catch (error) {
      if (error instanceof UniqueViolationError) throw new GraphQLError(error.message, { extensions: { code: 'CONFLICT', field: error.field } });
      throw error;
    }
  }

  /** The field resolver of every field: the table's resolver when there is one, else the property of the parent. */
  private readonly fieldResolver: GraphQLFieldResolver<unknown, GqlContext> = (source, args, context, info) => {
    const spec = this.model.resolvers.get(`${info.parentType.name}.${info.fieldName}`);
    if (spec !== undefined) return this.resolveSpec(spec, source, args as Record<string, unknown>, context, `${info.parentType.name}.${info.fieldName}`);
    if (typeof source === 'object' && source !== null) {
      const value = (source as Record<string, unknown>)[info.fieldName];
      return value === undefined ? null : value;
    }
    return null;
  };

  /** The event stream of a subscription field. */
  private readonly subscribeResolver: GraphQLFieldResolver<unknown, GqlContext> = (_source, _args, _context, info) => {
    const spec = this.model.resolvers.get(`${info.parentType.name}.${info.fieldName}`);
    if (spec?.kind !== 'event') throw new GraphQLError(`${info.parentType.name}.${info.fieldName} has no event to listen to. Name one in \`resolvers\`: { "event": "orders.shipped" }.`);
    return eventIterator(this.deps.events, (event) => {
      if (event.name !== spec.event) return undefined;
      // A data change streams its record (what the generated type describes); a custom event streams its payload.
      const shown = publicPayload(this.deps.definition(), event);
      return isPlainObject(shown) && typeof shown.collection === 'string' && isPlainObject(shown.record) ? shown.record : (event.payload ?? null);
    });
  };

  execute(prepared: Prepared, variables: Record<string, unknown> | undefined, context: GqlContext, signal?: AbortSignal): Promise<ExecutionResult> {
    return Promise.resolve(
      execute({ schema: this.model.schema, document: prepared.document, operationName: prepared.operation.name?.value ?? null, variableValues: variables ?? null, contextValue: context, fieldResolver: this.fieldResolver, abortSignal: signal ?? null }),
    );
  }

  subscribe(prepared: Prepared, variables: Record<string, unknown> | undefined, context: GqlContext): Promise<AsyncGenerator<ExecutionResult, void, void> | ExecutionResult> {
    return Promise.resolve(
      subscribe({ schema: this.model.schema, document: prepared.document, operationName: prepared.operation.name?.value ?? null, variableValues: variables ?? null, contextValue: context, fieldResolver: this.fieldResolver, subscribeFieldResolver: this.subscribeResolver }),
    );
  }

  /** Checks the sign-in rule of an operation: the errors to answer with, or none. */
  authErrors(prepared: Prepared, user: AuthUser | undefined): RequestError[] {
    if (user !== undefined) return [];
    return needsSignIn(prepared, this.limits).length === 0 ? [] : [{ message: unauthorized().message, extensions: { code: 'UNAUTHENTICATED' } }];
  }

  /** The whole POST: body, size, parse, measure, validate, sign-in, execute. */
  async handleHttp(ctx: RequestCtx, context: GqlContext): Promise<Reply> {
    const answer = (status: number, body: unknown, operation?: string): Reply => ({
      ...jsonReply(status, body),
      // `raw` keeps the backend's success wrapper off: a GraphQL answer is `{ data, errors }` and nothing else.
      raw: JSON.stringify(body),
      ...(operation === undefined ? {} : { operation }),
    });
    const errors = (status: number, list: RequestError[]): Reply => answer(status, { errors: list });
    if (!/json/i.test(String(ctx.headers['content-type'] ?? ''))) return errors(415, [{ message: 'Send the request as application/json: { "query": "...", "variables": {...} }.', extensions: { code: 'BAD_REQUEST' } }]);
    let body: unknown;
    try {
      body = JSON.parse(ctx.bodyText) as unknown;
    } catch {
      return errors(400, [{ message: 'The request body is not valid JSON.', extensions: { code: 'BAD_REQUEST' } }]);
    }
    if (Array.isArray(body)) return errors(400, [{ message: 'Batching is not supported: send one operation per request.', extensions: { code: 'BATCHING_NOT_SUPPORTED' } }]);
    if (!isPlainObject(body) || typeof body.query !== 'string' || body.query.trim() === '') return errors(400, [{ message: 'Must provide a query string.', extensions: { code: 'BAD_REQUEST' } }]);
    if (body.variables !== undefined && body.variables !== null && !isPlainObject(body.variables)) return errors(400, [{ message: 'variables must be an object.', extensions: { code: 'BAD_REQUEST' } }]);
    const operationName = typeof body.operationName === 'string' ? body.operationName : undefined;
    const prepared = prepare(this.model, this.limits, { query: body.query, operationName });
    if (!prepared.ok) return errors(prepared.status, prepared.errors);
    const { prepared: operation } = prepared;
    if (operation.type === 'subscription') return answer(400, { errors: [{ message: 'Subscriptions need a WebSocket: connect with the graphql-transport-ws subprotocol.', extensions: { code: 'SUBSCRIPTION_NEEDS_WEBSOCKET' } }] }, operation.name);
    const denied = this.authErrors(operation, context.user);
    if (denied.length > 0) return answer(401, { errors: denied }, operation.name);
    const result = await this.execute(operation, variablesOf(body.variables), context, ctx.signal);
    return answer('data' in result ? 200 : 400, result, operation.name);
  }
}
