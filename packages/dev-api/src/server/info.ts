import pkg from '../../package.json' with { type: 'json' };

export type Scheme = 'http' | 'https';

export interface CertInfo {
  present: boolean;
  /** ISO date the leaf certificate expires. */
  notAfter?: string;
  /** Whether the certificate lists the current LAN address, so a phone can open it. */
  coversLanIp?: boolean;
}

/** What the process that starts the server knows, handed to `createServer`. */
export interface ServerInfoOptions {
  /** The project folder's name. */
  project: string;
  scheme: Scheme;
  port: number;
  /** The LAN address, when the server listens beyond this machine. */
  lan?: string | undefined;
  cert: CertInfo;
}

export interface ServerInfo {
  service: 'tempo-dev-api';
  version: string;
  project: string;
  scheme: Scheme;
  port: number;
  urls: { local: string; lan?: string; androidEmulator: string; iosSimulator: string };
  cert: CertInfo;
  startedAt: string;
}

/** The Android emulator reaches the host machine at this address. */
export const ANDROID_HOST = '10.0.2.2';

export function buildInfo(options: ServerInfoOptions, startedAt: string): ServerInfo {
  const at = (host: string): string => `${options.scheme}://${host}:${options.port}`;
  return {
    service: 'tempo-dev-api',
    version: pkg.version,
    project: options.project,
    scheme: options.scheme,
    port: options.port,
    urls: {
      local: at('localhost'),
      ...(options.lan === undefined ? {} : { lan: at(options.lan) }),
      androidEmulator: at(ANDROID_HOST),
      iosSimulator: at('localhost'),
    },
    cert: options.cert,
    startedAt,
  };
}
