import { homedir } from 'node:os';
import { join } from 'node:path';

import type { AssetSources } from './assets.ts';
import { createHub, noBackends, type BackendHost, type Hub } from './hub.ts';
import { closeServer, listenOn } from './server.ts';
import type { Clock } from './web-auth.ts';
import { LoginCodes, Sessions } from './web-auth.ts';

/** Where `web` keeps its backends unless `--backends-dir` says otherwise. */
export const defaultBackendsDir = (): string => join(homedir(), '.tempo-local-backend', 'backends');

/** The port the dashboard tries first; if it is taken the server picks a free one and says which. */
export const DEFAULT_WEB_PORT = 8555;

export interface WebOptions {
  host?: BackendHost;
  /** The dashboard's port on 127.0.0.1. `0` picks a free one. Default: 8555, else a free one. */
  adminPort?: number;
  assets?: AssetSources;
  clock?: Clock;
  codeTtlMs?: number;
  idleMs?: number;
  maxCodeFailures?: number;
}

export interface RunningWeb {
  readonly hub: Hub;
  readonly port: number;
  /** The first one-time login code. Printed by the CLI, never put in a URL. */
  readonly loginCode: string;
  readonly url: string;
  stop(): Promise<void>;
}

/** Starts the dashboard listener on 127.0.0.1 and issues the first login code. `stop` closes it. */
export async function startWeb(options: WebOptions = {}): Promise<RunningWeb> {
  const clock = options.clock;
  const hub = createHub({
    host: options.host ?? noBackends,
    ...(options.assets === undefined ? {} : { assets: options.assets }),
    codes: new LoginCodes({ ...(clock === undefined ? {} : { clock }), ...(options.codeTtlMs === undefined ? {} : { ttlMs: options.codeTtlMs }), ...(options.maxCodeFailures === undefined ? {} : { maxFailures: options.maxCodeFailures }) }),
    sessions: new Sessions({ ...(clock === undefined ? {} : { clock }), ...(options.idleMs === undefined ? {} : { idleMs: options.idleMs }) }),
  });
  const wanted = options.adminPort ?? DEFAULT_WEB_PORT;
  let port: number;
  try {
    port = await listenOn(hub.server, wanted, '127.0.0.1');
  } catch (error) {
    // Only the default port gives way; a port the user asked for is an error.
    if (options.adminPort !== undefined || (error as { code?: string }).code !== 'EADDRINUSE') throw error;
    port = await listenOn(hub.server, 0, '127.0.0.1');
  }
  const loginCode = hub.codes.issue();
  let stopping: Promise<void> | undefined;
  return {
    hub,
    port,
    loginCode,
    url: `http://127.0.0.1:${String(port)}/login`,
    stop() {
      stopping ??= closeServer(hub.server);
      return stopping;
    },
  };
}
