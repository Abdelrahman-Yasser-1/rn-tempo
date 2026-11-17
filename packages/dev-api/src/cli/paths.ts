import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const DEFAULT_CONFIG = 'api/tempo-api.config.ts';
/** The JSON workspace a project may have instead of a TypeScript config. */
export const WORKSPACE_FILE = 'tempo-api.json';

/** Everything the CLI reads and writes lives in `<cwd>/.tempo-api`. */
export interface Paths {
  cwd: string;
  config: string;
  dataDir: string;
  pidFile: string;
  logFile: string;
  tokenFile: string;
  /** `cert.pem`, `key.pem` and a copy of the public `rootCA.pem` (written by `tempo-api certs`). */
  certsDir: string;
  fixturesDir: string;
}

export function resolvePaths(cwd: string | undefined, config: string | undefined): Paths {
  const root = resolve(cwd ?? process.cwd());
  const dataDir = join(root, '.tempo-api');
  let configPath = resolve(root, config ?? DEFAULT_CONFIG);
  // No TypeScript config, but a workspace file at the project root: use that.
  if (config === undefined && !existsSync(configPath) && existsSync(join(root, WORKSPACE_FILE))) {
    configPath = join(root, WORKSPACE_FILE);
  }
  return {
    cwd: root,
    config: configPath,
    dataDir,
    pidFile: join(dataDir, 'server.pid'),
    logFile: join(dataDir, 'server.log'),
    tokenFile: join(dataDir, 'control-token'),
    certsDir: join(dataDir, 'certs'),
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
