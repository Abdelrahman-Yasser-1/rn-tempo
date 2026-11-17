import { join } from 'node:path';

import { BUILTIN_SCENARIOS, redactUrl, RequestLog, SCENARIO_HEADER } from '@rn-tempo/dev-api';

import { Accounts } from './accounts.ts';
import { authHandler, AuthService, usersHandler } from './auth.ts';
import { crudHandler } from './crud.ts';
import { readSeedFile, type BackendFolder } from './folder.ts';
import { jsonReply, loggableBody, problemReply, type Reply, type RequestCtx } from './http.ts';
import type { EngineLogger } from './logs.ts';
import { downloadReply, MediaService, uploadFailure, uploadJson } from './media.ts';
import { mountPath, Router, type Handler } from './router.ts';
import type { Backend, Collection, Endpoint, Scenario } from './schema.ts';
import { Stats } from './stats.ts';
import { Store, type Plan, type RenameHints } from './store.ts';
import { loadJwtSecret } from './tokens.ts';

export interface EngineOptions {
  /** Waits for a scenario's delay. Tests pass a faster one. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /**
   * Decides whether a `bearer` endpoint may be called. The default verifies the JWT and sets `ctx.user`;
   * a replacement should set `ctx.user` too if the endpoints it guards use `ownerField` or handlers.
   */
  authorize?: (ctx: RequestCtx, endpoint: Endpoint) => boolean;
  /** Where engine problems go (`.data/logs/engine.log` when started through `startBackend`). */
  logger?: EngineLogger;
  /** Called with every request log entry, after redaction. */
  onRequest?: (entry: ReturnType<RequestLog['record']>, endpointId: string | undefined) => void;
}

interface State {
  definition: Backend;
  router: Router;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

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
  /** App users, tokens and the JWT checks. */
  readonly auth: AuthService;
  /** Stored files (`.data/media`). */
  readonly media: MediaService;
  private state: State;
  private readonly options: Required<Pick<EngineOptions, 'sleep' | 'now' | 'authorize'>> & Pick<EngineOptions, 'onRequest' | 'logger'>;
  private readonly scenarioPicks = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(folder: BackendFolder, store: Store, state: State, options: EngineOptions) {
    this.folder = folder;
    this.store = store;
    this.state = state;
    const now = options.now ?? ((): Date => new Date());
    this.auth = new AuthService(new Accounts(store.db, now), loadJwtSecret(folder.dataDir), () => this.state.definition.auth, now);
    this.media = new MediaService(folder.dataDir, store.db, now);
    this.options = {
      sleep: options.sleep ?? defaultSleep,
      now,
      authorize: options.authorize ?? ((ctx): boolean => this.auth.authenticate(ctx)),
      ...(options.onRequest === undefined ? {} : { onRequest: options.onRequest }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    };
  }

  /** Opens the database, migrates it to the folder's definition (seeding new collections) and builds the routes. */
  static start(folder: BackendFolder, options: EngineOptions = {}): Engine {
    const store = Store.open(join(folder.dataDir, 'db.sqlite'));
    try {
      store.migrate(folder.definition.collections, { seedRows: (collection) => seedRows(folder.dir, collection) });
    } catch (error) {
      store.close();
      throw error;
    }
    try {
      const engine = new Engine(folder, store, { definition: folder.definition, router: new Router([], undefined) }, options);
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
    return `${origin ?? ''}${mountPath(this.state.definition.basePath, path).replace(':id', id)}`;
  }

  get definition(): Backend {
    return this.state.definition;
  }

  get router(): Router {
    return this.state.router;
  }

  close(): void {
    this.store.close();
  }

  private build(definition: Backend): State {
    const collections = new Map(definition.collections.map((collection) => [collection.name, collection]));
    const routes: { endpoint: Endpoint; path: string; handler: Handler }[] = [];
    for (const endpoint of definition.endpoints) {
      const handler = this.handlerFor(endpoint, collections);
      for (const path of [endpoint.path, ...(endpoint.aliases ?? [])]) routes.push({ endpoint, path, handler });
    }
    return { definition, router: new Router(routes, definition.basePath) };
  }

  private handlerFor(endpoint: Endpoint, collections: Map<string, Collection>): Handler {
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
      case 'static':
        return () => ({
          status: endpoint.status,
          headers: { 'content-type': 'application/json; charset=utf-8', ...endpoint.headers },
          ...(endpoint.body === undefined ? {} : { body: endpoint.body }),
        });
      default:
        return () =>
          problemReply(501, { title: 'Not Implemented', detail: `Endpoint type "${endpoint.type}" is coming in a later phase (Y2).` });
    }
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
      const plan = this.store.migrate(next.collections, {
        ...(options.hints === undefined ? {} : { hints: options.hints }),
        ...(options.confirm === undefined ? {} : { confirm: options.confirm }),
        seedRows: (collection) => seedRows(this.folder.dir, collection),
      });
      this.options.logger?.info({ ops: plan.ops.map((op) => op.op) }, 'definition applied');
      const state = this.build(next);
      this.state = state;
      this.seedUsers();
      const ids = new Set(next.endpoints.map((endpoint) => endpoint.id));
      for (const id of this.scenarioPicks.keys()) if (!ids.has(id)) this.scenarioPicks.delete(id);
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

  // ---- requests

  /** Answers one request and records it in the request log. Never throws. */
  async handle(ctx: RequestCtx): Promise<Reply> {
    const started = process.hrtime.bigint();
    const router = this.state.router; // held for the whole request
    let endpointId: string | undefined;
    let reply: Reply;
    try {
      const match = router.match(ctx.method, ctx.path);
      if (match.kind === 'none') {
        reply = problemReply(404, { detail: `No endpoint for ${ctx.method} ${ctx.path}.` });
      } else if (match.kind === 'method') {
        reply = problemReply(405, { detail: `${ctx.method} is not allowed here.`, headers: { allow: match.allowed.join(', ') } });
      } else {
        const { endpoint } = match.route;
        endpointId = endpoint.id;
        reply = await this.run(ctx, endpoint, () => match.route.handler(ctx, match.params));
      }
    } catch (error) {
      this.options.logger?.error({ err: error instanceof Error ? error.message : String(error), method: ctx.method, path: ctx.path }, 'request failed');
      reply = problemReply(500, { detail: 'Unexpected server error.' });
    }
    const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    const entry = this.requests.record(
      {
        method: ctx.method,
        url: redactUrl(ctx.url),
        status: reply.status,
        ms,
        scenario: reply.scenario,
        reqHeaders: ctx.headers,
        reqBody: loggableBody(ctx),
        resBody: reply.body,
      },
      this.options.now(),
    );
    this.stats.record(endpointId, reply.status, ms);
    this.options.onRequest?.(entry, endpointId);
    return reply;
  }

  /** Auth, then the scenario (header first, then the admin pick), then the endpoint itself. */
  private async run(ctx: RequestCtx, endpoint: Endpoint, handle: () => Reply | Promise<Reply>): Promise<Reply> {
    if (endpoint.auth === 'bearer' && !this.options.authorize(ctx, endpoint)) {
      return problemReply(401, { detail: 'Invalid or expired token' });
    }
    const headerName = ctx.headers[SCENARIO_HEADER];
    const requested = typeof headerName === 'string' && headerName !== '' ? headerName : undefined;
    const name = requested ?? this.scenarioPicks.get(endpoint.id);
    const scenario = name === undefined ? undefined : this.findScenario(endpoint, name);
    if (requested !== undefined && scenario === undefined) {
      return problemReply(400, { detail: `Unknown scenario "${requested}". Available: ${this.scenarioNames(endpoint).join(', ')}.` });
    }
    if (scenario === undefined || name === undefined) return handle();
    ctx.scenario = name;
    if (scenario.delayMs !== undefined) await this.options.sleep(scenario.delayMs);
    const status = scenario.status ?? 200;
    const extra = scenario.headers ?? {};
    if (scenario.body !== undefined) return { ...jsonReply(status, scenario.body, extra), scenario: name };
    if (scenario.status !== undefined && scenario.status >= 400) {
      const failure = problemReply(status, { headers: extra });
      return { ...failure, scenario: name };
    }
    if (scenario.status !== undefined) return { status, headers: { ...extra }, scenario: name };
    return { ...(await handle()), scenario: name };
  }
}

function seedRows(dir: string, collection: Collection): Record<string, unknown>[] {
  if (collection.seed === undefined) return [];
  return typeof collection.seed === 'string' ? readSeedFile(dir, collection.seed) : collection.seed;
}
