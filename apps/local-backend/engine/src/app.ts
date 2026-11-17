import type { Server } from 'node:http';

import { createAdminServer } from './admin.ts';
import { Engine, type EngineOptions } from './engine.ts';
import { openBackend } from './folder.ts';
import { Manager } from './manager.ts';
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
  const engine = Engine.start(folder, options);
  const wantsHttps = options.https ?? engine.definition.https;
  const tls = wantsHttps ? readTls(certsDirOf(engine)) : undefined;
  const notice = wantsHttps && tls === undefined ? 'No certificate in .data/certs: serving HTTP. Create one with `local-backend-engine certs <dir>`.' : undefined;
  const manager = new Manager(engine, {
    ...(options.watch === undefined ? {} : { watch: options.watch }),
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
  });
  const publicServer = createPublicServer(engine, () => false, tls);
  const adminServer = createAdminServer(manager);
  try {
    const port = await listenOn(publicServer, options.port ?? engine.definition.port, options.host ?? '0.0.0.0');
    const adminPort = await listenOn(adminServer.server, options.adminPort ?? 0, '127.0.0.1');
    manager.startWatching();
    return {
      engine,
      manager,
      admin: { host: '127.0.0.1', port: adminPort, token: adminServer.token },
      publicServer,
      scheme: tls === undefined ? 'http' : 'https',
      port,
      ...(notice === undefined ? {} : { notice }),
      async stop(): Promise<void> {
        manager.stopWatching();
        await Promise.all([closeServer(publicServer), closeServer(adminServer.server)]);
        engine.close();
      },
    };
  } catch (error) {
    manager.stopWatching();
    publicServer.close();
    adminServer.server.close();
    engine.close();
    throw error;
  }
}
