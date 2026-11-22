import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { join } from 'node:path';

import { snapshotStream } from './snapshot.ts';
import { buildTestSnapshot, testSnapshotReply } from './test-snapshot.ts';
import { createAdminServer, errorReply } from './admin.ts';
import type { AdminAccess } from './roles.ts';
import { docsHandler } from './docs.ts';
import { Engine, type EngineOptions } from './engine.ts';
import { openBackend } from './folder.ts';
import { checkContract, readOpenApiInside, requireDocument } from './contract.ts';
import { jsonReply, problemReply, readJson } from './http.ts';
import { createEngineLog, RequestFiles } from './logs.ts';
import { Manager } from './manager.ts';
import { adminRealtimeRoutes } from './admin-realtime.ts';
import { adminWebhookRoutes } from './admin-webhooks.ts';
import { adminInboxRoutes } from './admin-inbox.ts';
import { adminPushRoutes } from './admin-push.ts';
import { adminImportRoutes } from './import/admin-import.ts';
import { buildOpenApi } from './openapi.ts';
import { certsDirOf, closeServer, createPublicHandler, createPublicServer, createUpgradeHandler, listenOn, readTls, type PublicHandler, type UpgradeHandler } from './server.ts';

export interface StartOptions extends EngineOptions {
  /** Overrides `port` of backend.json. `0` picks a free port (tests). */
  port?: number;
  /** Defaults to `0.0.0.0`, so phones on the LAN can reach the API. */
  host?: string;
  /** Overrides `https` of backend.json. */
  https?: boolean;
  /** Port of the admin listener on 127.0.0.1. Defaults to a random free one. */
  adminPort?: number;
  /**
   * Open the admin listener on 127.0.0.1 (default true). The web hub passes `false`: it serves the admin API itself,
   * behind its own sign-in, through `handleAdmin`, so the backend opens no second port.
   */
  adminListener?: boolean;
  /**
   * Team server: no public port. The server routes `/b/<id>/...` to `handlePublic` and the URLs and OpenAPI the backend
   * hands out carry that prefix.
   */
  mounted?: { prefix: string };
  /** Checks the access key of a backend with `publicAccess: "key"` (the team server passes its key store). */
  accessKey?: (key: string | undefined) => boolean;
  /**
   * URL imports. `allowPrivate` lets the engine fetch addresses on private networks. It defaults to true, except for a
   * backend mounted by a team server (`mounted`), where it protects the server from being used to reach its own network.
   */
  importUrls?: { allowPrivate?: boolean };
  /** Watch backend.json for edits (default true). */
  watch?: boolean;
  /** Request log file limits (tests lower them). */
  logLimits?: { keepDays?: number; maxBytes?: number };
  /** Milliseconds to wait after a file change before reloading (default 200). */
  debounceMs?: number;
}

export interface RunningBackend {
  readonly engine: Engine;
  readonly manager: Manager;
  /** The admin listener, loopback only. The token is for the app that started this process. `port` is 0 without a listener. */
  readonly admin: { host: '127.0.0.1'; port: number; token: string };
  /** Serves one already authenticated admin request (`/__admin/...`). For the web hub, which does its own sign-in. */
  readonly handleAdmin: (req: IncomingMessage, res: ServerResponse, access?: AdminAccess) => Promise<void>;
  /** Every admin route as `METHOD pattern` (and `GET /events`), for the role table check. */
  readonly adminRoutes: string[];
  readonly publicServer: Server;
  /** Answers one public request (the same code the public server runs); the team server calls it for `/b/<id>`. */
  readonly handlePublic: PublicHandler;
  /** Answers one HTTP Upgrade (a WebSocket); the team server calls it for `/b/<id>` and `/s/<id>`. */
  readonly handleUpgrade: UpgradeHandler;
  readonly scheme: 'http' | 'https';
  readonly port: number;
  /** Set when HTTPS was wanted but there is no certificate, so the server fell back to HTTP. */
  readonly notice?: string;
  stop(): Promise<void>;
}

/** Opens a backend folder and serves it. */
export async function startBackend(dir: string, options: StartOptions = {}): Promise<RunningBackend> {
  const folder = openBackend(dir);
  const engineLog = createEngineLog(join(folder.dataDir, 'logs'));
  const files = new RequestFiles({ dir: join(folder.dataDir, 'logs'), ...(options.logLimits ?? {}) });
  const engine = Engine.start(folder, {
    ...options,
    // A team server must not be usable to reach the network it runs in (SSRF): the same switch as URL imports.
    outbound: { allowPrivate: options.importUrls?.allowPrivate ?? options.mounted === undefined, requireHttps: !(options.importUrls?.allowPrivate ?? options.mounted === undefined), ...options.outbound },
    ...(options.mounted === undefined ? {} : { publicPrefix: options.mounted.prefix }),
    logger: engineLog.logger,
    onRequest: (entry, endpointId) => {
      files.append(entry);
      options.onRequest?.(entry, endpointId);
    },
  });
  engineLog.logger.info({ backend: engine.definition.name }, 'engine started');
  const wantsHttps = options.https ?? engine.definition.https;
  const tls = wantsHttps ? readTls(certsDirOf(engine)) : undefined;
  const notice = wantsHttps && tls === undefined ? 'No certificate in .data/certs: serving HTTP. Create one with `local-backend-engine certs <dir>`.' : undefined;
  const manager = new Manager(engine, {
    ...(options.watch === undefined ? {} : { watch: options.watch }),
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
    onProblem: (message, fields) => engineLog.logger.warn(fields ?? {}, message),
  });
  const publicOptions = options.accessKey === undefined ? {} : { accessKey: options.accessKey };
  const publicServer = createPublicServer(engine, docsHandler(engine), tls, publicOptions);
  const handlePublic = createPublicHandler(engine, docsHandler(engine), publicOptions);
  const handleUpgrade = createUpgradeHandler(engine, publicOptions);
  const adminServer = createAdminServer(manager, {
    routes: [
      {
        method: 'GET',
        pattern: '/stats',
        handler: () => {
          const collections = Object.fromEntries(engine.definition.collections.map((collection) => [collection.name, engine.store.count(collection.name)]));
          return jsonReply(200, { ...engine.stats.snapshot(), collections });
        },
      },
      {
        // Body: an OpenAPI document (JSON), or `{ "path": "openapi.json" }` naming a JSON file inside the backend folder.
        method: 'POST',
        pattern: '/contract-check',
        handler: (ctx) => {
          const body = readJson(ctx);
          if (!body.ok) return body.reply;
          try {
            const value = body.value;
            const isPath = typeof value === 'object' && value !== null && !('paths' in value) && 'path' in value;
            if (isPath && typeof (value as { path: unknown }).path !== 'string') return problemReply(400, { detail: 'path must be text.' });
            const document = isPath ? readOpenApiInside(engine.folder.dir, (value as { path: string }).path) : requireDocument(value);
            return jsonReply(200, checkContract(engine.definition, document));
          } catch (error) {
            return errorReply(error);
          }
        },
      },
      {
        // The snapshot zip, streamed: definitions, handlers, seed, a consistent database copy and media. Never secrets or certs.
        method: 'GET',
        pattern: '/snapshot',
        handler: () => ({
          status: 200,
          headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="backend-snapshot.zip"', 'cache-control': 'no-store' },
          stream: snapshotStream({ dir: engine.folder.dir, db: engine.store.db }),
        }),
      },
      {
        // The test snapshot (JSON): definition, seed, handlers, data and small media. Never secrets, app users or sessions.
        method: 'GET',
        pattern: '/test-snapshot',
        handler: (ctx) => testSnapshotReply(() => buildTestSnapshot({ dir: engine.folder.dir, db: engine.store.db, collections: engine.definition.collections.map((collection) => collection.name) }), ctx.headers['if-none-match']),
      },
      ...adminRealtimeRoutes(engine),
      ...adminWebhookRoutes(engine, manager, errorReply),
      ...adminInboxRoutes(engine),
      ...adminPushRoutes(engine),
      ...adminImportRoutes(manager, { allowPrivate: options.importUrls?.allowPrivate ?? options.mounted === undefined }),
      { method: 'GET', pattern: '/openapi', handler: () => jsonReply(200, buildOpenApi(engine.definition, { prefix: engine.publicPrefix })) },
    ],
  });
  try {
    const port = options.mounted === undefined ? await listenOn(publicServer, options.port ?? engine.definition.port, options.host ?? '0.0.0.0') : 0;
    const adminPort = options.adminListener === false ? 0 : await listenOn(adminServer.server, options.adminPort ?? 0, '127.0.0.1');
    manager.startWatching();
    let stopping: Promise<void> | undefined;
    return {
      engine,
      manager,
      admin: { host: '127.0.0.1', port: adminPort, token: adminServer.token },
      handleAdmin: adminServer.handle,
      adminRoutes: ['GET /events', ...adminServer.routes.map((route) => `${route.method} ${route.pattern}`)],
      publicServer,
      handlePublic,
      handleUpgrade,
      scheme: tls === undefined ? 'http' : 'https',
      port,
      ...(notice === undefined ? {} : { notice }),
      /** Stops both listeners and closes the database and logs. Safe to call twice. */
      stop(): Promise<void> {
        stopping ??= (async (): Promise<void> => {
          manager.stopWatching();
          engine.realtime.closeAll();
          await Promise.all([closeServer(publicServer), closeServer(adminServer.server)]);
          engine.close();
          files.close();
          engineLog.close();
        })();
        return stopping;
      },
    };
  } catch (error) {
    manager.stopWatching();
    publicServer.close();
    adminServer.server.close();
    engine.close();
    files.close();
    engineLog.close();
    throw error;
  }
}
