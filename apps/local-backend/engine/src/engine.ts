import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { join } from 'node:path';

import { BUILTIN_SCENARIOS, redactUrl, RequestLog, SCENARIO_HEADER } from '@rn-tempo/dev-api';

import { Accounts } from './accounts.ts';
import { authHandler, AuthService, usersHandler } from './auth.ts';
import { ContentService, modelOf } from './content.ts';
import { handleContent } from './content-public.ts';
import { crudHandler } from './crud.ts';
import { EventBus } from './events.ts';
import { GraphqlRuntime, type GqlContext } from './graphql.ts';
import { buildGraphqlModel } from './graphql-schema.ts';
import { GRAPHQL_WS_PROTOCOL, runGraphqlSocket } from './graphql-ws.ts';
import { hiddenFieldsByCollection, Realtime } from './realtime.ts';
import { sseHandler } from './sse.ts';
import { bearerFrom, LiveSocket, protocolsForLog, refuseUpgrade, WebSocketService, type LiveLogEntry } from './websocket.ts';
import { createHandlerRpc } from './handler-host.ts';
import { HandlerFileError, handlerFailure, HandlerPool, replyFromHandler, resolveHandlerFile, type RunResult } from './handlers.ts';
import { readSeedFile, type BackendFolder } from './folder.ts';
import { jsonReply, loggableBody, problemReply, readJson, type Reply, type RequestCtx } from './http.ts';
import type { EngineLogger } from './logs.ts';
import { downloadReply, MediaService, uploadFailure, uploadJson } from './media.ts';
import { Rng } from './import/generate.ts';
import { noteOf, paceRequest, planNetwork, requestSeed, sleepFor, testModeOf, type NetworkPlan, type RequestPlan } from './network.ts';
import { TEST_MODE_NOW, TEST_MODE_SEED } from './constants.ts';
import { fill, PlaceholderError, type PlaceholderContext } from './placeholders.ts';
import { cleanHeaders, errorBody, expandTemplate, isTemplateRef, wrapBody, wrapperOf } from './responses.ts';
import { mountPath, Router, type Handler, type Params } from './router.ts';
import { toCtx } from './server.ts';
import { buildRequestValidator, invalidRequest } from './import/request-validation.ts';
import type { Backend, Collection, Endpoint, GraphqlEndpoint, Scenario, StaticEndpoint } from './schema.ts';
import { Stats } from './stats.ts';
import { Store, type Plan, type RenameHints } from './store.ts';
import { loadJwtSecret } from './tokens.ts';

export interface EngineOptions {
  /** Waits for a delay. Tests pass a faster one. It must return early when `signal` aborts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Keep the database in memory (SQLite `:memory:`) instead of `.data/db.sqlite`. The test kit uses it; nothing survives `close()`. */
  memory?: boolean;
  /** Test mode for every request: no delays, throttling or timeouts, a fixed clock and seeded random values. */
  testMode?: boolean;
  /** The seed of random delays (and of random values outside test mode). A fresh random one by default. */
  seed?: string;
  now?: () => Date;
  /**
   * Decides whether a `bearer` endpoint may be called. The default verifies the JWT and sets `ctx.user`;
   * a replacement should set `ctx.user` too if the endpoints it guards use `ownerField` or handlers.
   */
  authorize?: (ctx: RequestCtx, endpoint: Endpoint) => boolean;
  /** Where engine problems go (`.data/logs/engine.log` when started through `startBackend`). */
  logger?: EngineLogger;
  /** The path the public API is served under when a server mounts it (`/b/<id>`), for the URLs and OpenAPI it hands out. */
  publicPrefix?: string;
  /** Called with every request log entry, after redaction. */
  onRequest?: (entry: ReturnType<RequestLog['record']>, endpointId: string | undefined) => void;
}

interface State {
  definition: Backend;
  router: Router;
  /** The running GraphQL schema of each `graphql` endpoint, by endpoint id. */
  graphql: Map<string, GraphqlRuntime>;
}

type Held = 'ok' | 'closed' | 'abandoned';

/** How often scheduled content is checked. */
export const SCHEDULE_TICK_MS = 30_000;

/**
 * The running backend: a definition, its database, the route table built from it, the scenario picks and
 * the request log. `applyDefinition` swaps the route table in one assignment; a request holds the table it
 * started with, so in-flight requests finish on the old one.
 */
export class Engine {
  readonly folder: BackendFolder;
  readonly store: Store;
  readonly requests = new RequestLog();
  readonly stats = new Stats();
  readonly startedAt = new Date().toISOString();
  /** `/b/<id>` when the team server mounts this backend, else empty. */
  readonly publicPrefix: string;
  /** App users, tokens and the JWT checks. */
  readonly auth: AuthService;
  /** Stored files (`.data/media`). */
  readonly media: MediaService;
  /** Content types' entries, versions and the public reads. */
  readonly content: ContentService;
  /** Workers that run `handler` endpoints. */
  readonly handlers: HandlerPool;
  /** Data change events (`products.created`, `content.published`, a handler's `ctx.emit`). Published after the write commits. */
  readonly events: EventBus;
  /** The connected clients of SSE, WebSocket and GraphQL endpoints. */
  readonly realtime: Realtime;
  /** The `ws` servers of websocket endpoints. */
  readonly sockets = new WebSocketService();
  private state: State;
  private readonly options: Required<Pick<EngineOptions, 'sleep' | 'now' | 'authorize'>> & Pick<EngineOptions, 'onRequest' | 'logger'>;
  /** Turns delays off for every request (`--test-mode`). */
  readonly testMode: boolean;
  private readonly seed: string;
  private requestCounter = 0;
  private closed = false;
  /** What `{{now}}` shows in test mode. A test kit can move it. */
  testClock = new Date(TEST_MODE_NOW);
  /** The `{{seq}}` counter of each endpoint (requests that reached it). Test kits reset it per session. */
  private readonly sequences = new Map<string, number>();
  private readonly scenarioPicks = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly dueTimer: NodeJS.Timeout;

  private constructor(folder: BackendFolder, store: Store, content: ContentService, state: State, options: EngineOptions) {
    this.folder = folder;
    this.store = store;
    this.state = state;
    this.publicPrefix = options.publicPrefix ?? '';
    this.testMode = options.testMode === true;
    this.seed = options.seed ?? randomBytes(8).toString('hex');
    const now = options.now ?? ((): Date => new Date());
    this.auth = new AuthService(new Accounts(store.db, now), loadJwtSecret(folder.dataDir), () => this.state.definition.auth, now);
    this.media = new MediaService(folder.dataDir, store.db, now);
    this.content = content;
    this.handlers = new HandlerPool(options.logger);
    this.events = new EventBus(now);
    this.realtime = new Realtime({ events: this.events, definition: () => this.state.definition, now });
    store.onChange = (change): void => this.events.emit(`${change.payload.collection}.${change.action}`, change.payload);
    content.onEvent = (name, payload): void => this.events.emit(name, payload);
    this.options = {
      sleep: options.sleep ?? sleepFor,
      now,
      authorize: options.authorize ?? ((ctx): boolean => this.auth.authenticate(ctx)),
      ...(options.onRequest === undefined ? {} : { onRequest: options.onRequest }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    };
    // Scheduled entries also go live while nobody reads (a read publishes them too).
    this.dueTimer = setInterval(() => {
      try {
        this.content.publishDue();
      } catch (error) {
        this.options.logger?.warn({ err: error instanceof Error ? error.message : String(error) }, 'publishing scheduled content failed');
      }
    }, SCHEDULE_TICK_MS);
    this.dueTimer.unref();
  }

  /** Opens the database, migrates it to the folder's definition (seeding new collections) and builds the routes. */
  static start(folder: BackendFolder, options: EngineOptions = {}): Engine {
    const store = Store.open(options.memory === true ? ':memory:' : join(folder.dataDir, 'db.sqlite'));
    const content = new ContentService(store.db, options.now ?? ((): Date => new Date()));
    try {
      const contentPlan = content.plan(modelOf(folder.definition));
      store.migrate(folder.definition.collections, {
        seedRows: (collection) => seedRows(folder.dir, collection),
        within: () => contentPlan.run(),
      });
    } catch (error) {
      store.close();
      throw error;
    }
    try {
      const engine = new Engine(folder, store, content, { definition: folder.definition, router: new Router([], undefined), graphql: new Map() }, options);
      engine.state = engine.build(folder.definition);
      engine.seedUsers();
      return engine;
    } catch (error) {
      store.close();
      throw error;
    }
  }

  /** Creates the `auth.seedUsers` that were never seeded before. A user deleted later is not brought back. */
  private seedUsers(): void {
    const key = 'seeded_users';
    const row = this.store.db.prepare('SELECT value FROM _meta WHERE key = ?').get(key);
    const seeded = new Set<string>(row === undefined ? [] : (JSON.parse(String(row.value)) as string[]));
    const created = this.auth.seed(this.state.definition.auth.seedUsers, seeded);
    if (created.length === 0) return;
    for (const name of created) seeded.add(name);
    this.store.db.prepare('INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify([...seeded]));
  }

  /** Whether the endpoint for this request reads its own body (uploads), so the listener must not. */
  streamsBody(method: string, path: string): boolean {
    const match = this.state.router.match(method, path);
    return match.kind === 'found' && match.route.endpoint.type === 'upload';
  }

  /** The URL a stored file is served from: the first `download` endpoint, else the conventional `/media/<id>`. */
  mediaUrl(id: string, origin?: string): string {
    const download = this.state.definition.endpoints.find((endpoint) => endpoint.type === 'download');
    const path = download === undefined ? '/media/:id' : download.path;
    return `${origin ?? ''}${this.publicPrefix}${mountPath(this.state.definition.basePath, path).replace(':id', id)}`;
  }

  get definition(): Backend {
    return this.state.definition;
  }

  get router(): Router {
    return this.state.router;
  }

  close(): void {
    this.closed = true;
    clearInterval(this.dueTimer);
    this.realtime.closeAll();
    this.sockets.close();
    void this.handlers.close();
    this.store.close();
  }

  private build(definition: Backend): State {
    const collections = new Map(definition.collections.map((collection) => [collection.name, collection]));
    const routes: { endpoint: Endpoint; path: string; handler: Handler }[] = [];
    const graphql = new Map<string, GraphqlRuntime>();
    for (const endpoint of definition.endpoints) {
      const handler = this.handlerFor(endpoint, collections, graphql, definition);
      for (const path of [endpoint.path, ...(endpoint.aliases ?? [])]) routes.push({ endpoint, path, handler });
    }
    return { definition, router: new Router(routes, definition.basePath), graphql };
  }

  private handlerFor(endpoint: Endpoint, collections: Map<string, Collection>, graphql: Map<string, GraphqlRuntime>, definition: Backend): Handler {
    switch (endpoint.type) {
      case 'crud': {
        const collection = collections.get(endpoint.collection);
        if (collection === undefined) throw new Error(`Unknown collection "${endpoint.collection}".`);
        return crudHandler(endpoint, collection, this.store, this.options.now, {
          mediaRecord: (id) => this.media.get(id),
          mediaUrl: (id, origin) => this.mediaUrl(id, origin),
        });
      }
      case 'auth':
        return authHandler(endpoint, this.auth);
      case 'users':
        return usersHandler(endpoint, this.auth);
      case 'upload':
        return async (ctx) => {
          try {
            const limit = endpoint.maxBytes ?? this.state.definition.media.maxBytes;
            // Slow uploads are paced here, right before the body is read, because an upload reads its own stream.
            const uploadKbps = ctx.plan?.network.uploadKbps;
            if (uploadKbps !== undefined && ctx.stream !== undefined) paceRequest(ctx.stream, uploadKbps);
            const records = await this.media.receive(ctx, { maxBytes: limit, multiple: endpoint.multiple, uploadedBy: ctx.user?.id });
            return uploadJson(
              records.map((record) => this.media.describe(record, this.mediaUrl(record.id, ctx.origin))),
              endpoint.multiple,
            );
          } catch (error) {
            return uploadFailure(error);
          }
        };
      case 'download':
        return (ctx, params) => downloadReply(this.media, params.id ?? '', ctx.headers);
      case 'static': {
        const validator = buildRequestValidator(endpoint.request);
        return (ctx, params) => {
          if (validator !== undefined) {
            const found = validator.check(ctx, params);
            if (!Array.isArray(found)) return found;
            if (found.length > 0) return invalidRequest(found);
          }
          return this.staticReply(endpoint, ctx.values ?? this.placeholders(ctx, endpoint, params));
        };
      }
      case 'sse':
        return sseHandler(endpoint, { realtime: this.realtime, zeroed: (headers) => this.delaysZeroed(headers), now: this.options.now });
      case 'graphql': {
        const runtime = this.graphqlRuntime(endpoint, definition);
        graphql.set(endpoint.id, runtime);
        return async (ctx) => {
          // An open endpoint still knows who is calling when a token comes with the request (`{{user.id}}`, handler resolvers).
          if (ctx.user === undefined && ctx.headers.authorization !== undefined) this.options.authorize(ctx, endpoint);
          const values = ctx.values ?? this.placeholders(ctx, endpoint, {});
          values.user = ctx.user;
          return runtime.handleHttp(ctx, { request: ctx, user: ctx.user, values });
        };
      }
      case 'websocket':
        return () => problemReply(426, { title: 'Upgrade Required', detail: 'This is a WebSocket endpoint: connect with ws:// or wss://.', headers: { upgrade: 'websocket' } });
      case 'handler':
        return async (ctx, params) => {
          const label = endpoint.id;
          let file: string;
          try {
            file = resolveHandlerFile(this.folder.dir, endpoint.file);
          } catch (error) {
            if (!(error instanceof HandlerFileError)) throw error;
            this.options.logger?.warn({ handler: label }, error.message);
            return problemReply(500, { detail: error.message });
          }
          this.handlers.watchFolder(join(this.folder.dir, 'handlers'));
          let body: unknown;
          if (ctx.bodyText !== '') {
            if (/json/i.test(String(ctx.headers['content-type'] ?? ''))) {
              const parsed = readJson(ctx);
              if (!parsed.ok) return parsed.reply;
              body = parsed.value;
            } else body = ctx.bodyText;
          }
          const result = await this.handlers.run({
            file,
            label,
            timeoutMs: endpoint.timeoutMs,
            scenario: ctx.scenario,
            origin: ctx.origin,
            req: {
              method: ctx.method,
              path: ctx.path,
              params,
              query: Object.fromEntries(ctx.query),
              headers: { ...ctx.headers },
              body,
              user: ctx.user,
            },
            rpc: createHandlerRpc(
              { store: this.store, emit: (name, payload) => this.events.emit(name, payload), userCount: () => this.auth.accounts.list({ limit: 1 }).total, definition: () => this.state.definition, media: this.media, mediaUrl: (id, origin) => this.mediaUrl(id, origin), logger: this.options.logger },
              label,
            ),
          });
          if (result.kind === 'ok') return replyFromHandler(result.value);
          this.options.logger?.warn({ handler: label, outcome: result.kind, ...(result.kind === 'timeout' ? { timeoutMs: endpoint.timeoutMs } : { message: result.message }) }, 'handler did not finish');
          return handlerFailure(result);
        };
    }
  }

  private graphqlRuntime(endpoint: GraphqlEndpoint, definition: Backend): GraphqlRuntime {
    const model = buildGraphqlModel(definition, endpoint, hiddenFieldsByCollection(definition));
    return new GraphqlRuntime(
      model,
      { maxDepth: endpoint.maxDepth, maxFields: endpoint.maxFields, maxQueryBytes: endpoint.maxQueryBytes, introspection: endpoint.introspection, requireAuth: endpoint.requireAuth },
      {
        store: this.store,
        definition: () => this.state.definition,
        events: this.events,
        mediaExists: (id) => this.media.has(id),
        callHandler: (file, label, context, body) => this.callHandlerFile(file, label, context, body),
      },
      endpoint.id,
    );
  }

  /** Runs a handler file for something that is not a `handler` endpoint (a GraphQL field resolver). */
  private async callHandlerFile(file: string, label: string, context: GqlContext, body: unknown): Promise<RunResult> {
    let resolved: string;
    try {
      resolved = resolveHandlerFile(this.folder.dir, file);
    } catch (error) {
      if (!(error instanceof HandlerFileError)) throw error;
      this.options.logger?.warn({ handler: label }, error.message);
      return { kind: 'error', message: error.message };
    }
    this.handlers.watchFolder(join(this.folder.dir, 'handlers'));
    const ctx = context.request;
    return this.handlers.run({
      file: resolved,
      label,
      timeoutMs: 5000,
      scenario: undefined,
      origin: ctx.origin,
      req: { method: ctx.method, path: ctx.path, params: {}, query: Object.fromEntries(ctx.query), headers: { ...ctx.headers }, body, user: context.user },
      rpc: createHandlerRpc(
        { store: this.store, emit: (name, payload) => this.events.emit(name, payload), userCount: () => this.auth.accounts.list({ limit: 1 }).total, definition: () => this.state.definition, media: this.media, mediaUrl: (id, origin) => this.mediaUrl(id, origin), logger: this.options.logger },
        label,
      ),
    });
  }

  /** Runs definition changes one at a time. */
  private serialize<T>(task: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Migrates the database to `next` and swaps the routes. Throws MigrationConfirmError when data would be
   * deleted and `confirm` is not set; nothing changes then.
   */
  applyDefinition(next: Backend, options: { confirm?: boolean; hints?: RenameHints } = {}): Promise<Plan> {
    return this.serialize(() => {
      const contentPlan = this.content.plan(modelOf(next), options.hints?.contentFields);
      const plan = this.store.migrate(next.collections, {
        ...(options.hints === undefined ? {} : { hints: options.hints }),
        ...(options.confirm === undefined ? {} : { confirm: options.confirm }),
        seedRows: (collection) => seedRows(this.folder.dir, collection),
        extraLost: contentPlan.lost,
        within: () => contentPlan.run(),
      });
      this.options.logger?.info({ ops: plan.ops.map((op) => op.op) }, 'definition applied');
      const state = this.build(next);
      this.state = state;
      this.realtime.reconcile(next);
      this.seedUsers();
      const ids = new Set(next.endpoints.map((endpoint) => endpoint.id));
      for (const id of this.scenarioPicks.keys()) if (!ids.has(id)) this.scenarioPicks.delete(id);
      for (const id of this.sequences.keys()) if (!ids.has(id)) this.sequences.delete(id);
      return plan;
    });
  }

  // ---- scenarios

  activeScenarios(): Record<string, string> {
    return Object.fromEntries(this.scenarioPicks);
  }

  scenarioNames(endpoint: Endpoint): string[] {
    return Object.keys({ ...BUILTIN_SCENARIOS, ...endpoint.scenarios });
  }

  private findScenario(endpoint: Endpoint, name: string): Scenario | undefined {
    return endpoint.scenarios[name] ?? BUILTIN_SCENARIOS[name];
  }

  /** Picks a scenario for an endpoint until cleared. Returns false for an unknown endpoint or scenario. */
  setScenario(endpointId: string, name: string): boolean {
    const endpoint = this.state.definition.endpoints.find((candidate) => candidate.id === endpointId);
    if (endpoint === undefined || this.findScenario(endpoint, name) === undefined) return false;
    this.scenarioPicks.set(endpointId, name);
    return true;
  }

  clearScenario(endpointId?: string): void {
    if (endpointId === undefined) this.scenarioPicks.clear();
    else this.scenarioPicks.delete(endpointId);
  }

  // ---- network simulation

  /**
   * The delay and throttling of a request, worked out from its endpoint, the scenario it picks and its headers. The public
   * listener calls it before the body is read; `handle` calls it when nobody did. A random delay is drawn from an RNG seeded
   * with this request's number, so the same number always gives the same delay.
   */
  planRequest(method: string, path: string, headers: IncomingHttpHeaders, router: Router = this.state.router): RequestPlan {
    const found = router.match(method, path);
    const endpoint = found.kind === 'found' ? found.route.endpoint : undefined;
    const definition = this.state.definition;
    const { testMode, zeroed } = testModeOf({ engine: this.testMode, definition: definition.testMode, headers });
    const requestId = (this.requestCounter += 1);
    const header = headers[SCENARIO_HEADER];
    const picked = typeof header === 'string' && header !== '' ? header : endpoint === undefined ? undefined : this.scenarioPicks.get(endpoint.id);
    const scenario = endpoint === undefined || picked === undefined ? undefined : this.findScenario(endpoint, picked);
    const network = planNetwork({ definition, endpoint, scenario, zeroed, rng: new Rng(requestSeed(testMode ? TEST_MODE_SEED : this.seed, requestId)) });
    return { requestId, testMode, network };
  }

  /** Whether delays are 0 for a request with these headers (test mode, unless it asks for its delays back). */
  delaysZeroed(headers: IncomingHttpHeaders): boolean {
    return testModeOf({ engine: this.testMode, definition: this.state.definition.testMode, headers }).zeroed;
  }

  // ---- live connections (WebSocket upgrades)

  /** Records a connect, a message or a disconnect of a live connection in the request log (method `WS`) and the stats. */
  recordLive(entry: LiveLogEntry): void {
    if (this.closed) return;
    const logged = this.requests.record(
      { method: 'WS', url: redactUrl(entry.url), status: entry.status, ms: entry.ms, reqHeaders: entry.headers ?? {}, reqBody: entry.reqBody, resBody: entry.resBody, operation: entry.operation },
      this.options.now(),
    );
    this.stats.record(entry.endpointId, entry.status, entry.ms, entry.operation);
    this.options.onRequest?.(logged, entry.endpointId);
  }

  /**
   * An HTTP Upgrade request on the public listener. The path picks a `websocket` endpoint (or a `graphql` one, for
   * subscriptions); the bearer token, the limits and the endpoint's own rules are checked before the socket becomes a
   * WebSocket, and a refusal is a plain HTTP answer.
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, meta: { scheme?: 'http' | 'https'; ip?: string } = {}): void {
    socket.on('error', () => undefined);
    const ctx = toCtx(req, '', meta.scheme, meta.ip);
    const router = this.state.router;
    const found = router.match('GET', ctx.path);
    const endpoint = found.kind === 'found' ? found.route.endpoint : undefined;
    if (endpoint?.type !== 'websocket') {
      const posted = router.match('POST', ctx.path);
      const graphql = posted.kind === 'found' && posted.route.endpoint.type === 'graphql' ? posted.route.endpoint : undefined;
      if (graphql !== undefined && posted.kind === 'found') return this.acceptGraphql({ endpoint: graphql, ctx, params: posted.params, req, socket, head, router });
    }
    if (found.kind !== 'found' || endpoint?.type !== 'websocket') return refuseUpgrade(socket, found.kind === 'none' ? 404 : 400, found.kind === 'none' ? 'No endpoint for this path.' : 'This endpoint is not a WebSocket endpoint.');
    const bearer = bearerFrom(req.headers, ctx.query);
    if (bearer !== undefined && ctx.headers.authorization === undefined) ctx.headers = { ...ctx.headers, authorization: `Bearer ${bearer.token}` };
    if (endpoint.auth === 'bearer' && !this.options.authorize(ctx, endpoint)) return refuseUpgrade(socket, 401, 'Invalid or expired token', { 'WWW-Authenticate': 'Bearer' });
    const hub = this.realtime.hub(endpoint.id, 'websocket');
    this.realtime.track(endpoint);
    const ipHash = this.realtime.hashIp(ctx.ip);
    if (hub.refusal(ipHash, endpoint) !== undefined) return refuseUpgrade(socket, 429, 'Too many connections', { 'Retry-After': '5' });
    ctx.plan = this.planRequest('GET', ctx.path, ctx.headers, router);
    const values = this.placeholders(ctx, endpoint, found.params);
    values.user = ctx.user;
    const logHeaders: Record<string, unknown> = { ...req.headers };
    if (req.headers['sec-websocket-protocol'] !== undefined) logHeaders['sec-websocket-protocol'] = protocolsForLog(req.headers['sec-websocket-protocol']);
    this.sockets.accept({
      req,
      socket,
      head,
      endpoint,
      hub,
      ipHash,
      clientId: this.realtime.newId(),
      user: ctx.user?.username,
      values,
      url: ctx.url,
      logHeaders,
      deps: { now: this.options.now, record: (entry) => this.recordLive(entry), zeroed: this.delaysZeroed(req.headers) },
    });
  }

  /** A WebSocket on a `graphql` endpoint's path: subscriptions with the graphql-transport-ws subprotocol. */
  private acceptGraphql(input: { endpoint: GraphqlEndpoint; ctx: RequestCtx; params: Params; req: IncomingMessage; socket: Duplex; head: Buffer; router: Router }): void {
    const { endpoint, ctx, req, socket } = input;
    const runtime = this.state.graphql.get(endpoint.id);
    if (runtime === undefined) return refuseUpgrade(socket, 404, 'No endpoint for this path.');
    const bearer = bearerFrom(req.headers, ctx.query);
    if (bearer !== undefined) {
      if (ctx.headers.authorization === undefined) ctx.headers = { ...ctx.headers, authorization: `Bearer ${bearer.token}` };
      // A bad token is refused here; a missing one may still come in `connection_init`.
      if (!this.options.authorize(ctx, endpoint) && endpoint.auth === 'bearer') return refuseUpgrade(socket, 401, 'Invalid or expired token', { 'WWW-Authenticate': 'Bearer' });
    }
    const hub = this.realtime.hub(endpoint.id, 'graphql');
    this.realtime.track(endpoint);
    const ipHash = this.realtime.hashIp(ctx.ip);
    if (hub.refusal(ipHash, endpoint) !== undefined) return refuseUpgrade(socket, 429, 'Too many connections', { 'Retry-After': '5' });
    ctx.plan = this.planRequest('POST', ctx.path, ctx.headers, input.router);
    const values = this.placeholders(ctx, endpoint, input.params);
    values.user = ctx.user;
    const logHeaders: Record<string, unknown> = { ...req.headers };
    if (req.headers['sec-websocket-protocol'] !== undefined) logHeaders['sec-websocket-protocol'] = protocolsForLog(req.headers['sec-websocket-protocol']);
    const deps = { now: this.options.now, record: (entry: LiveLogEntry) => this.recordLive(entry), zeroed: this.delaysZeroed(req.headers) };
    const clientId = this.realtime.newId();
    const maxPayload = Math.min(1_048_576, endpoint.maxQueryBytes + 65_536);
    this.sockets.upgrade(
      endpoint.id,
      { signature: JSON.stringify([maxPayload]), maxPayload, protocol: (offered) => (offered.includes(GRAPHQL_WS_PROTOCOL) ? GRAPHQL_WS_PROTOCOL : false) },
      req,
      socket,
      input.head,
      (ws) => {
        const client = new LiveSocket(ws, hub, { id: clientId, ipHash, connectedAt: this.options.now().toISOString(), maxBuffered: endpoint.maxBufferedBytes, pingIntervalMs: endpoint.pingIntervalMs });
        client.user = ctx.user?.username;
        client.protocol = ws.protocol === '' ? undefined : ws.protocol;
        hub.add(client);
        deps.record({ endpointId: endpoint.id, url: ctx.url, status: 101, ms: 0, headers: logHeaders, resBody: { event: 'connect', client: client.id } });
        if (ws.protocol !== GRAPHQL_WS_PROTOCOL) {
          client.whenGone(() => undefined);
          return client.close(1002, 'Subprotocol not acceptable');
        }
        runGraphqlSocket({
          ws,
          client,
          hub,
          runtime,
          context: { request: ctx, user: ctx.user, values },
          authenticate: (token) => {
            const probe: RequestCtx = { ...ctx, headers: { ...ctx.headers, authorization: `Bearer ${token}` }, user: undefined };
            return this.options.authorize(probe, endpoint) ? probe.user : undefined;
          },
          requireSignIn: endpoint.auth === 'bearer',
          initTimeoutMs: endpoint.initTimeoutMs,
          maxOperations: endpoint.maxOperationsPerConnection,
          deps,
          endpointId: endpoint.id,
          url: ctx.url,
        });
      },
    );
  }

  // ---- requests

  /** Answers one request and records it in the request log. Never throws. */
  async handle(ctx: RequestCtx): Promise<Reply> {
    const started = process.hrtime.bigint();
    const router = this.state.router; // held for the whole request
    const plan = ctx.plan ?? this.planRequest(ctx.method, ctx.path, ctx.headers, router);
    ctx.plan = plan;
    let endpointId: string | undefined;
    let reply: Reply;
    let outcome: Held = 'ok';
    try {
      const publicContent = handleContent(
        { definition: this.state.definition, content: this.content, media: this.media, mediaUrl: (id, origin) => this.mediaUrl(id, origin) },
        ctx,
      );
      const match = publicContent === undefined ? router.match(ctx.method, ctx.path) : undefined;
      if (match?.kind === 'found') endpointId = match.route.endpoint.id;
      outcome = await this.hold(plan.network, ctx.signal);
      if (outcome === 'closed') {
        reply = { status: 0, headers: {}, close: true };
      } else if (outcome === 'abandoned') {
        reply = { status: 499, headers: {}, abandoned: true };
      } else if (publicContent !== undefined) {
        reply = this.finalize(publicContent, undefined, this.placeholders(ctx, undefined, {}));
      } else if (match?.kind === 'none') {
        reply = this.finalize(problemReply(404, { detail: `No endpoint for ${ctx.method} ${ctx.path}.` }), undefined, this.placeholders(ctx, undefined, {}));
      } else if (match?.kind === 'method') {
        reply = this.finalize(problemReply(405, { detail: `${ctx.method} is not allowed here.`, headers: { allow: match.allowed.join(', ') } }), undefined, this.placeholders(ctx, undefined, {}));
      } else if (match?.kind === 'found') {
        const { endpoint } = match.route;
        const values = this.placeholders(ctx, endpoint, match.params);
        ctx.values = values;
        reply = this.finalize(await this.run(ctx, endpoint, values, () => match.route.handler(ctx, match.params)), endpoint, values);
      } else {
        reply = problemReply(500, { detail: 'Unexpected server error.' });
      }
    } catch (error) {
      if (error instanceof PlaceholderError) {
        reply = problemReply(500, { detail: error.message });
      } else {
        this.options.logger?.error({ err: error instanceof Error ? error.message : String(error), method: ctx.method, path: ctx.path }, 'request failed');
        reply = problemReply(500, { detail: 'Unexpected server error.' });
      }
    }
    if (outcome === 'ok' && plan.network.downloadKbps !== undefined && reply.live !== true) reply = { ...reply, downloadKbps: plan.network.downloadKbps };
    const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    const network = noteOf(plan.network, outcome === 'closed' ? 'closed' : 'done');
    const entry = this.requests.record(
      {
        method: ctx.method,
        url: redactUrl(ctx.url),
        status: reply.status,
        ms,
        scenario: reply.scenario,
        network,
        reqHeaders: ctx.headers,
        reqBody: loggableBody(ctx),
        resBody: reply.body,
        operation: reply.operation,
      },
      this.options.now(),
    );
    this.stats.record(endpointId, reply.status, ms, reply.operation);
    this.options.onRequest?.(entry, endpointId);
    return reply;
  }

  /** Waits the planned delay. The `timeout` plan ends in `closed`; a client that leaves meanwhile ends it early as `abandoned`. */
  private async hold(plan: NetworkPlan, signal?: AbortSignal): Promise<Held> {
    if (plan.delayMs <= 0) return 'ok';
    await this.options.sleep(plan.delayMs, signal);
    if (signal?.aborted === true) return 'abandoned';
    return plan.timeoutMs === undefined ? 'ok' : 'closed';
  }

  /** Auth, then the scenario (header first, then the admin pick), then the endpoint itself. */
  private async run(ctx: RequestCtx, endpoint: Endpoint, values: PlaceholderContext, handle: () => Reply | Promise<Reply>): Promise<Reply> {
    if (endpoint.auth === 'bearer' && !this.options.authorize(ctx, endpoint)) {
      return problemReply(401, { detail: 'Invalid or expired token' });
    }
    // `placeholders` ran before the token was checked, so the user is added now.
    values.user = ctx.user;
    const headerName = ctx.headers[SCENARIO_HEADER];
    const requested = typeof headerName === 'string' && headerName !== '' ? headerName : undefined;
    const name = requested ?? this.scenarioPicks.get(endpoint.id);
    const scenario = name === undefined ? undefined : this.findScenario(endpoint, name);
    if (requested !== undefined && scenario === undefined) {
      return problemReply(400, { detail: `Unknown scenario "${requested}". Available: ${this.scenarioNames(endpoint).join(', ')}.` });
    }
    if (scenario === undefined || name === undefined) return handle();
    ctx.scenario = name;
    const extra = cleanHeaders(scenario.headers, values);
    if (scenario.body !== undefined) {
      const expanded = this.bodyOf(scenario.body, values);
      const status = scenario.status ?? expanded.status ?? 200;
      return { ...jsonReply(status, expanded.body, { ...expanded.headers, ...extra }), scenario: name };
    }
    const status = scenario.status ?? 200;
    if (scenario.status !== undefined && scenario.status >= 400) {
      const failure = problemReply(status, { headers: extra });
      return { ...failure, scenario: name };
    }
    if (scenario.status !== undefined) return { status, headers: { ...extra }, scenario: name };
    return { ...(await handle()), scenario: name };
  }

  // ---- shared response shape

  /** The static endpoint's answer: its body (a template reference is expanded first), status and headers. */
  private staticReply(endpoint: StaticEndpoint, values: PlaceholderContext): Reply {
    const expanded = endpoint.body === undefined ? { body: undefined } : this.bodyOf(endpoint.body, values);
    // A template's status applies when the endpoint leaves its own at the default (200).
    const status = endpoint.status === 200 && 'status' in expanded && expanded.status !== undefined ? expanded.status : endpoint.status;
    return {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...('headers' in expanded ? expanded.headers : undefined), ...cleanHeaders(endpoint.headers, values) },
      ...(expanded.body === undefined ? {} : { body: expanded.body }),
    };
  }

  /** A body from the definition: a template reference is expanded, anything else has its placeholders filled. */
  private bodyOf(body: unknown, values: PlaceholderContext): { body: unknown; status?: number; headers?: Record<string, string> } {
    return isTemplateRef(body) ? expandTemplate(body, this.state.definition.responseTemplates, values) : { body: fill(body, values) };
  }

  /** What the placeholders of one request can see. `user` is set after the token check. */
  private placeholders(ctx: RequestCtx, endpoint: Endpoint | undefined, params: Params): PlaceholderContext {
    const test = ctx.plan?.testMode === true;
    const seq = endpoint === undefined ? 0 : this.nextSequence(endpoint.id);
    const rng = new Rng(test ? `${TEST_MODE_SEED}:${endpoint?.id ?? ''}:${String(seq)}` : `${requestSeed(this.seed, ctx.plan?.requestId ?? 0)}:values`);
    let parsed: { value: unknown } | undefined;
    return {
      params,
      query: ctx.query,
      headers: ctx.headers,
      body: (): unknown => {
        parsed ??= { value: requestJson(ctx) };
        return parsed.value;
      },
      user: ctx.user,
      now: () => (test ? this.testClock : this.options.now()),
      uuid: () => (test ? seededUuid(rng) : randomUUID()),
      seq: () => seq,
      rng,
    };
  }

  private nextSequence(endpointId: string): number {
    const next = (this.sequences.get(endpointId) ?? 0) + 1;
    this.sequences.set(endpointId, next);
    return next;
  }

  /** Starts every endpoint's `{{seq}}` again at 1 (a new test session). */
  resetSequences(): void {
    this.sequences.clear();
  }

  /**
   * The last step of every answer: the backend's error format for errors the engine made, the success wrapper for JSON
   * success answers, and the common headers (the backend's, then the endpoint's, then the answer's own).
   */
  private finalize(reply: Reply, endpoint: Endpoint | undefined, values: PlaceholderContext): Reply {
    const definition = this.state.definition;
    let out = reply;
    if (reply.problem === true) {
      const body = isObject(reply.body) ? reply.body : {};
      const custom = errorBody(definition, { status: reply.status, message: String(body.message ?? body.detail ?? body.title ?? ''), errors: Array.isArray(body.errors) ? body.errors : [] }, values);
      if (custom !== undefined) {
        const { problem: _problem, ...rest } = reply;
        out = { ...rest, body: custom, headers: { ...reply.headers, 'content-type': 'application/json; charset=utf-8' } };
      }
    } else if (endpoint !== undefined && isWrappable(reply)) {
      const wrapper = wrapperOf(definition, endpoint);
      if (wrapper !== undefined) out = { ...reply, body: wrapBody(wrapper, reply.body, values) };
    }
    const common = { ...cleanHeaders(definition.responses?.headers, values), ...cleanHeaders(endpoint?.headers, values) };
    return Object.keys(common).length === 0 ? out : { ...out, headers: { ...common, ...out.headers } };
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A 2xx answer with a JSON body the engine holds (not a file, a stream or raw text). */
function isWrappable(reply: Reply): boolean {
  return reply.status >= 200 && reply.status < 300 && reply.body !== undefined && reply.raw === undefined && reply.file === undefined && reply.stream === undefined && /json/i.test(reply.headers['content-type'] ?? '');
}

/** The parsed JSON body of a request, or `undefined` when there is none or it is not JSON. */
function requestJson(ctx: RequestCtx): unknown {
  if (ctx.bodyText.trim() === '' || !/json/i.test(String(ctx.headers['content-type'] ?? ''))) return undefined;
  try {
    return JSON.parse(ctx.bodyText) as unknown;
  } catch {
    return undefined;
  }
}

/** A version 4 UUID from the seeded generator (test mode). */
function seededUuid(rng: Rng): string {
  return `${rng.hex(8)}-${rng.hex(4)}-4${rng.hex(3)}-a${rng.hex(3)}-${rng.hex(12)}`;
}

function seedRows(dir: string, collection: Collection): Record<string, unknown>[] {
  if (collection.seed === undefined) return [];
  return typeof collection.seed === 'string' ? readSeedFile(dir, collection.seed) : collection.seed;
}
