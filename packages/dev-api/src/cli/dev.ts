import { defineCommand } from 'citty';

import { createCerts, realRunner, type Runner } from './certs.ts';
import { startInBackground, type UpOptions } from './commands.ts';
import { resolvePaths, type Paths } from './paths.ts';
import { lanAddress } from './process.ts';
import { hasCerts } from './tls.ts';
import { trustAndroid, trustIos } from './trust.ts';

export type Platform = 'ios' | 'android';

/** What `dev` calls. Injected so tests never touch mkcert, a simulator, an emulator or a trust store. */
export interface DevDeps {
  run: Runner;
  say: (line?: string) => void;
  lan: () => string | undefined;
  up: (options: UpOptions) => Promise<void>;
}

export interface DevOptions {
  platform: Platform;
  paths: Paths;
  port?: string | undefined;
  host: string;
  http: boolean;
}

/**
 * One command for the daily loop: make certificates when they are missing, trust the CA where the
 * app runs, then `up`. With `--http` there is nothing to trust, so it only starts the server.
 */
export async function runDev(options: DevOptions, deps: DevDeps): Promise<void> {
  const { platform, paths } = options;
  const say = deps.say;
  if (!options.http) {
    if (!hasCerts(paths)) {
      say('No certificate yet; creating one with mkcert.');
      createCerts({ outDir: paths.certsDir, extraHosts: [], install: false, lan: deps.lan() }, deps.run, say);
      say();
    }
    if (platform === 'ios') trustIos(deps.run, say);
    else trustAndroid(deps.run, say, true);
    say();
  } else {
    say('--http: serving plain HTTP, so there is no certificate to trust.');
  }
  await deps.up({ cwd: paths.cwd, config: undefined, port: options.port, host: options.host, http: options.http });
}

const say = (line = ''): void => void process.stdout.write(`${line}\n`);

function platformCommand(platform: Platform, description: string) {
  return defineCommand({
    meta: { name: platform, description },
    args: {
      cwd: { type: 'string', description: 'Project folder (default: the current folder)' },
      port: { type: 'string', description: 'Port (default: the config port)' },
      host: { type: 'string', description: 'Address to listen on (default 0.0.0.0)', default: '0.0.0.0' },
      http: { type: 'boolean', description: 'Serve plain HTTP: skips the certificate and trust steps' },
    },
    async run({ args }) {
      try {
        await runDev(
          { platform, paths: resolvePaths(args.cwd, undefined), port: args.port, host: args.host, http: args.http === true },
          { run: realRunner, say, lan: lanAddress, up: startInBackground },
        );
      } catch (error) {
        process.stderr.write(`tempo-api: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    },
  });
}

export const dev = defineCommand({
  meta: { name: 'dev', description: 'Create certificates, trust them on a simulator or emulator, then start the dev API' },
  subCommands: {
    ios: platformCommand('ios', 'Trust the CA on the booted iOS simulator, then start the dev API'),
    android: platformCommand('android', 'Push the CA to the Android emulator, then start the dev API'),
  },
});
