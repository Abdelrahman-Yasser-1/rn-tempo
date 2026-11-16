import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const DEFAULT_CONFIG = 'api/tempo-api.config.ts';

/** Everything the CLI reads and writes lives in `<cwd>/.tempo-api`. */
export interface Paths {
  cwd: string;
  config: string;
  dataDir: string;
  pidFile: string;
  logFile: string;
  tokenFile: string;
  fixturesDir: string;
}

export function resolvePaths(cwd: string | undefined, config: string | undefined): Paths {
  const root = resolve(cwd ?? process.cwd());
  const dataDir = join(root, '.tempo-api');
  const configPath = resolve(root, config ?? DEFAULT_CONFIG);
  return {
    cwd: root,
    config: configPath,
    dataDir,
    pidFile: join(dataDir, 'server.pid'),
    logFile: join(dataDir, 'server.log'),
    tokenFile: join(dataDir, 'control-token'),
    fixturesDir: join(dirname(configPath), 'fixtures'),
  };
}

/** Creates the data dir (owner only, because it holds the control token and mock tokens). */
export function ensureDataDir(paths: Paths): void {
  mkdirSync(paths.dataDir, { recursive: true, mode: 0o700 });
}

/**
 * The secret that lets the local CLI call the internal control routes. It is a file readable only
 * by the current user, so another local user or a web page cannot change scenarios.
 */
export function ensureControlToken(paths: Paths): string {
  ensureDataDir(paths);
  if (existsSync(paths.tokenFile)) return readFileSync(paths.tokenFile, 'utf8').trim();
  const token = randomBytes(24).toString('hex');
  writeFileSync(paths.tokenFile, token, { mode: 0o600 });
  chmodSync(paths.tokenFile, 0o600);
  return token;
}

/** The token if it exists; never creates one. */
export function readControlToken(paths: Paths): string | undefined {
  return existsSync(paths.tokenFile) ? readFileSync(paths.tokenFile, 'utf8').trim() : undefined;
}
