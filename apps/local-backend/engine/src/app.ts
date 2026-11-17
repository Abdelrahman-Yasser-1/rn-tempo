import type { Server } from 'node:http';
import { join } from 'node:path';

import { createAdminServer, errorReply } from './admin.ts';
import { docsHandler } from './docs.ts';
import { Engine, type EngineOptions } from './engine.ts';
import { openBackend } from './folder.ts';
import { checkContract, readOpenApiInside, requireDocument } from './contract.ts';
import { jsonReply, problemReply, readJson } from './http.ts';
import { createEngineLog, RequestFiles } from './logs.ts';
import { Manager } from './manager.ts';
import { buildOpenApi } from './openapi.ts';
import { certsDirOf, closeServer, createPublicServer, listenOn, readTls } from './server.ts';

export interface StartOptions extends EngineOptions {
  /** Overrides `port` of backend.json. `0` picks a free port (tests). */
  port?: number;
  /** Defaults to `0.0.0.0`, so phones on the LAN can reach the API. */
  host?: string;
  /** Overrides `https` of backend.json. */
  https?: boolean;
  /** Port of the admin listener on 127.0.0.1. Defaults to a random free one. */
  adminPort?: number;
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
  /** The admin listener, loopback only. The token is for the app that started this process. */
  readonly admin: { host: '127.0.0.1'; port: number; token: string };
  readonly publicServer: Server;
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
  const publicServer = createPublicServer(engine, docsHandler(engine), tls);
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
      { method: 'GET', pattern: '/openapi', handler: () => jsonReply(200, buildOpenApi(engine.definition)) },
    ],
  });
  try {
    const port = await listenOn(publicServer, options.port ?? engine.definition.port, options.host ?? '0.0.0.0');
    const adminPort = await listenOn(adminServer.server, options.adminPort ?? 0, '127.0.0.1');
    manager.startWatching();
    let stopping: Promise<void> | undefined;
    return {
      engine,
      manager,
      admin: { host: '127.0.0.1', port: adminPort, token: adminServer.token },
      publicServer,
      scheme: tls === undefined ? 'http' : 'https',
      port,
      ...(notice === undefined ? {} : { notice }),
      /** Stops both listeners and closes the database and logs. Safe to call twice. */
      stop(): Promise<void> {
        stopping ??= (async (): Promise<void> => {
          manager.stopWatching();
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
