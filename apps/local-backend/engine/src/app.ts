import type { Server } from 'node:http';

import { Engine, type EngineOptions } from './engine.ts';
import { openBackend } from './folder.ts';
import { certsDirOf, closeServer, createPublicServer, listenOn, readTls } from './server.ts';

export interface StartOptions extends EngineOptions {
  /** Overrides `port` of backend.json. `0` picks a free port (tests). */
  port?: number;
  /** Defaults to `0.0.0.0`, so phones on the LAN can reach the API. */
  host?: string;
  /** Overrides `https` of backend.json. */
  https?: boolean;
}

export interface RunningBackend {
  readonly engine: Engine;
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
  const publicServer = createPublicServer(engine, () => false, tls);
  try {
    const port = await listenOn(publicServer, options.port ?? engine.definition.port, options.host ?? '0.0.0.0');
    return {
      engine,
      publicServer,
      scheme: tls === undefined ? 'http' : 'https',
      port,
      ...(notice === undefined ? {} : { notice }),
      async stop(): Promise<void> {
        await closeServer(publicServer);
        engine.close();
      },
    };
  } catch (error) {
    engine.close();
    throw error;
  }
}
