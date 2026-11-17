#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { createCerts, lanAddress, realRunner } from '@rn-tempo/dev-api';

import { startBackend } from './app.ts';
import { createBackend, PRESETS, prepareDataDir, type Preset } from './folder.ts';
import { DefinitionError } from './schema.ts';

const USAGE = `local-backend-engine: serve a Tempo Local Backend folder

  local-backend-engine create <dir> [--name <name>] [--preset empty|products|tempo-template]
  local-backend-engine certs  <dir>            create an HTTPS certificate with mkcert (never changes a trust store)
  local-backend-engine serve  <dir> [--port <n>] [--http] [--admin-port <n>] [--no-watch]

serve prints one JSON line on stdout when it is ready, with the admin port and its token.
That line is the only place the token appears.
`;

const err = (line: string): void => void process.stderr.write(`${line}\n`);

async function serve(dir: string, values: { port?: string | undefined; http?: boolean | undefined; 'admin-port'?: string | undefined; 'no-watch'?: boolean | undefined }): Promise<void> {
  const running = await startBackend(dir, {
    ...(values.port === undefined ? {} : { port: Number(values.port) }),
    ...(values.http === true ? { https: false } : {}),
    ...(values['admin-port'] === undefined ? {} : { adminPort: Number(values['admin-port']) }),
    ...(values['no-watch'] === true ? { watch: false } : {}),
  });
  if (running.notice !== undefined) err(running.notice);
  err(`${running.engine.definition.name}: ${running.scheme}://localhost:${running.port}  (docs at /__docs)`);
  process.stdout.write(
    `${JSON.stringify({
      event: 'ready',
      name: running.engine.definition.name,
      scheme: running.scheme,
      port: running.port,
      admin: running.admin,
      ...(running.notice === undefined ? {} : { notice: running.notice }),
    })}\n`,
  );
  const stop = (): void => void running.stop().then(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      preset: { type: 'string' },
      port: { type: 'string' },
      'admin-port': { type: 'string' },
      http: { type: 'boolean' },
      'no-watch': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, dir] = positionals;
  if (values.help === true || command === undefined || dir === undefined) {
    process.stdout.write(USAGE);
    process.exit(values.help === true ? 0 : 1);
  }
  const root = resolve(dir);
  switch (command) {
    case 'create': {
      const preset = values.preset ?? 'empty';
      if (!(PRESETS as readonly string[]).includes(preset)) throw new DefinitionError(`Unknown preset "${preset}". Use ${PRESETS.join(' or ')}.`);
      createBackend(root, { name: values.name ?? root.split('/').pop() ?? 'backend', preset: preset as Preset });
      err(`Created ${join(root, 'backend.json')}`);
      return;
    }
    case 'certs': {
      const outDir = join(prepareDataDir(root), 'certs');
      createCerts({ outDir, extraHosts: [], install: false, lan: lanAddress() }, realRunner, () => undefined);
      err(`Certificate written to ${outDir}. The local CA is in \`mkcert -CAROOT\`; nothing was added to a trust store.`);
      return;
    }
    case 'serve':
      return serve(root, values);
    default:
      process.stdout.write(USAGE);
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  err(`local-backend-engine: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
