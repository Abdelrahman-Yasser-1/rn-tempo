import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createHttpsServer, type ServerOptions as TlsOptions } from 'node:https';

import type { DevServer } from './app.ts';

export interface ListenOptions {
  port: number;
  /** `127.0.0.1` keeps the server on this machine; `0.0.0.0` exposes it on the LAN. */
  host?: string;
  /** Certificate and key. When set the listener speaks HTTPS. */
  tls?: TlsOptions;
}

/** Starts listening and resolves with the server once the port is bound. */
export function listen(server: DevServer, options: ListenOptions): Promise<Server> {
  const http = options.tls === undefined ? createHttpServer(server.app) : createHttpsServer(options.tls, server.app);
  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host ?? '127.0.0.1', () => {
      http.off('error', reject);
      resolve(http);
    });
  });
}
