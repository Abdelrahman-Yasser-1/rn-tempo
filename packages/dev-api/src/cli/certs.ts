import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { defineCommand } from 'citty';

import { resolvePaths } from './paths.ts';
import { lanAddress } from './process.ts';
import { CA_FILE, CERT_FILE, KEY_FILE } from './tls.ts';

export const MKCERT_HINT =
  'mkcert is not installed. On macOS run `brew install mkcert`; for Linux and Windows see https://github.com/FiloSottile/mkcert#installation. Nothing was downloaded.';

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Set when the program could not start at all (for example it is not installed). */
  error?: Error;
}

/** Runs an external program. Injected so tests never need mkcert, xcrun or adb. */
export type Runner = (command: string, args: string[], options?: { inherit?: boolean }) => RunResult;

export const realRunner: Runner = (command, args, options) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options?.inherit === true ? 'inherit' : 'pipe',
    env: process.env, // keeps CAROOT, so a temp CAROOT is honoured
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(result.error === undefined ? {} : { error: result.error }),
  };
};

/** Hostnames and addresses every generated certificate covers (the 10.0.2.2 alias is the Android emulator's host). */
export const DEFAULT_NAMES = ['localhost', '127.0.0.1', '::1', '10.0.2.2', 'dev-api.tempo.test', 'api.tempo.test', 'portal.tempo.test'];

/**
 * `--host a,b` and a repeated `--host` both work. citty keeps only the last value of a repeated
 * string flag, so the values are read from the raw arguments.
 */
export function splitHosts(rawArgs: string[]): string[] {
  const values: string[] = [];
  rawArgs.forEach((arg, index) => {
    if (arg === '--host') values.push(rawArgs[index + 1] ?? '');
    else if (arg.startsWith('--host=')) values.push(arg.slice('--host='.length));
  });
  return values.flatMap((item) => item.split(',')).map((item) => item.trim()).filter((item) => item !== '');
}

export function certNames(extra: string[], lan: string | undefined): string[] {
  return [...new Set([...DEFAULT_NAMES, ...(lan === undefined ? [] : [lan]), ...extra])];
}

export function mkcertArgs(outDir: string, names: string[]): string[] {
  return ['-cert-file', join(outDir, CERT_FILE), '-key-file', join(outDir, KEY_FILE), ...names];
}

export interface CertsOptions {
  outDir: string;
  extraHosts: string[];
  install: boolean;
  lan: string | undefined;
}

/** Asks mkcert where its CA lives. Throws a readable error when mkcert is missing or fails. */
export function caRoot(run: Runner): string {
  const result = run('mkcert', ['-CAROOT']);
  if (result.error !== undefined) throw new Error(MKCERT_HINT);
  const dir = result.stdout.trim();
  if (result.status !== 0 || dir === '') throw new Error(`mkcert -CAROOT failed: ${result.stderr.trim()}`);
  return dir;
}

/**
 * Creates the local CA when it is missing (mkcert does that on first use), writes the leaf
 * certificate and key, and copies the public CA certificate next to them. It never changes a trust
 * store unless `install` is set, which runs `mkcert -install`.
 */
export function createCerts(options: CertsOptions, run: Runner, say: (line?: string) => void): void {
  const root = caRoot(run);
  if (options.install) {
    const installed = run('mkcert', ['-install'], { inherit: true });
    if (installed.status !== 0) throw new Error('mkcert -install failed.');
  }
  mkdirSync(options.outDir, { recursive: true });
  const names = certNames(options.extraHosts, options.lan);
  const made = run('mkcert', mkcertArgs(options.outDir, names));
  if (made.error !== undefined) throw new Error(MKCERT_HINT);
  if (made.status !== 0) throw new Error(`mkcert failed: ${made.stderr.trim()}`);
  chmodSync(join(options.outDir, KEY_FILE), 0o600);
  copyFileSync(join(root, 'rootCA.pem'), join(options.outDir, CA_FILE));

  say(`Certificate written to ${options.outDir} for:`);
  say(`  ${names.join(', ')}`);
  say();
  say(`Local CA: ${root}`);
  say('  rootCA-key.pem there signs certificates. It never leaves this machine and must never be committed or shared.');
  say(`  ${join(options.outDir, CA_FILE)} is the public half, safe to copy to a device.`);
  say();
  say('Next steps, so the app trusts the CA:');
  say('  iOS simulator:    yarn api trust ios');
  say('  Android emulator: yarn api trust android   (then install it from Settings)');
  say('  Physical devices: see the "Local HTTPS" page in the docs');
  if (!options.install) say('  Browser on this machine (opt-in, asks for your password): yarn api certs --install');
  say('Then start the server with `yarn api up` (HTTPS is used when the certificate exists).');
}

const say = (line = ''): void => void process.stdout.write(`${line}\n`);

export const certs = defineCommand({
  meta: { name: 'certs', description: 'Create a local HTTPS certificate with mkcert' },
  args: {
    cwd: { type: 'string', description: 'Project folder (default: the current folder)' },
    out: { type: 'string', description: 'Where to write cert.pem and key.pem (default .tempo-api/certs)' },
    host: { type: 'string', description: 'Extra host name or address to cover (repeat the flag or use a comma list)' },
    install: {
      type: 'boolean',
      description: 'Also run `mkcert -install`: adds the CA to this computer\'s trust stores so a browser trusts it. Asks for the system password. Off by default',
    },
  },
  run({ args, rawArgs }) {
    const paths = resolvePaths(args.cwd, undefined);
    const outDir = args.out === undefined ? paths.certsDir : isAbsolute(args.out) ? args.out : resolve(paths.cwd, args.out);
    const hosts = splitHosts(rawArgs);
    try {
      createCerts({ outDir, extraHosts: hosts, install: args.install === true, lan: lanAddress() }, realRunner, say);
    } catch (error) {
      process.stderr.write(`tempo-api: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  },
});
