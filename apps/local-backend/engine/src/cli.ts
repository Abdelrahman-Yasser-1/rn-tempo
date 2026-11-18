#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { createCerts, lanAddress, realRunner } from '@rn-tempo/dev-api';

import { startBackend } from './app.ts';
import { checkContract, formatReport, parseOpenApi } from './contract.ts';
import { exportSnapshot, importSnapshot } from './snapshot.ts';
import { readFileSync } from 'node:fs';
import { readDefinitionText, createBackend, PRESETS, prepareDataDir, type Preset } from './folder.ts';
import { DefinitionError } from './schema.ts';
import { trustAndroid, trustIos, trustMac } from './trust.ts';

const USAGE = `local-backend-engine: serve a Tempo Local Backend folder

  local-backend-engine create <dir> [--name <name>] [--preset empty|products|tempo-template] [--port <n>]
  local-backend-engine certs  <dir>            create an HTTPS certificate with mkcert (never changes a trust store)
  local-backend-engine check  <dir> --openapi <file> [--json]   compare the backend with an OpenAPI file (exit 1 on differences)
  local-backend-engine snapshot export <dir> <file.zip>
  local-backend-engine snapshot import <file.zip> <dir> [--no-certs]   into a new or empty folder
  local-backend-engine trust  mac | ios [--device <udid>] | android [--serial <id>]   add the mkcert CA to a trust store (explicit)
  local-backend-engine serve  <dir> [--port <n>] [--http] [--admin-port <n>] [--no-watch] [--parent-stdin]

serve prints one JSON line on stdout when it is ready, with the admin port and its token.
That line is the only place the token appears.
`;

const err = (line: string): void => void process.stderr.write(`${line}\n`);

async function serve(dir: string, values: { port?: string | undefined; http?: boolean | undefined; 'admin-port'?: string | undefined; 'no-watch'?: boolean | undefined; 'parent-stdin'?: boolean | undefined }): Promise<void> {
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
  // The desktop app keeps our stdin open; when it dies the pipe closes and the engine stops instead of lingering.
  if (values['parent-stdin'] === true) {
    process.stdin.on('end', stop);
    process.stdin.on('close', stop);
    process.stdin.resume();
  }
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
      openapi: { type: 'string' },
      json: { type: 'boolean' },
      'no-certs': { type: 'boolean' },
      http: { type: 'boolean' },
      'no-watch': { type: 'boolean' },
      'parent-stdin': { type: 'boolean' },
      device: { type: 'string' },
      serial: { type: 'string' },
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
      const port = values.port === undefined ? undefined : Number(values.port);
      if (port !== undefined && !(Number.isInteger(port) && port >= 1 && port <= 65_535)) throw new DefinitionError('--port must be a number from 1 to 65535.');
      createBackend(root, { name: values.name ?? root.split('/').pop() ?? 'backend', preset: preset as Preset, ...(port === undefined ? {} : { port }) });
      err(`Created ${join(root, 'backend.json')}`);
      return;
    }
    case 'certs': {
      const outDir = join(prepareDataDir(root), 'certs');
      createCerts({ outDir, extraHosts: [], install: false, lan: lanAddress() }, realRunner, () => undefined);
      err(`Certificate written to ${outDir}. The local CA is in \`mkcert -CAROOT\`; nothing was added to a trust store.`);
      return;
    }
    case 'check': {
      if (values.openapi === undefined) throw new DefinitionError('check needs --openapi <file>.');
      let text: string;
      try {
        text = readFileSync(resolve(values.openapi), 'utf8');
      } catch {
        throw new DefinitionError(`Cannot read ${values.openapi}.`);
      }
      const report = checkContract(readDefinitionText(join(root, 'backend.json')).definition, parseOpenApi(text, values.openapi));
      process.stdout.write(values.json === true ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
      process.exit(report.ok ? 0 : 1);
      return;
    }
    case 'snapshot': {
      // `snapshot export <dir> <file>` and `snapshot import <file> <dir>`: here `dir` is the sub-command.
      const [, sub, one, two] = positionals;
      if (sub === 'export' && one !== undefined && two !== undefined) {
        await exportSnapshot({ dir: resolve(one) }, resolve(two));
        err(`Snapshot written to ${resolve(two)} (no secrets or certificates are in it).`);
        return;
      }
      if (sub === 'import' && one !== undefined && two !== undefined) {
        const target = resolve(two);
        const result = await importSnapshot(resolve(one), target);
        err(`Imported ${String(result.files)} files into ${target}.`);
        err('The backend gets a new JWT secret when it is served (old tokens stop working) and has no sign-in sessions.');
        if (values['no-certs'] !== true) {
          try {
            createCerts({ outDir: join(prepareDataDir(target), 'certs'), extraHosts: [], install: false, lan: lanAddress() }, realRunner, () => undefined);
            err('New certificate written to .data/certs (nothing was added to a trust store).');
          } catch (error) {
            err(`No certificate was made (${error instanceof Error ? error.message.split('\n')[0] : 'mkcert failed'}). Run \`certs\` later.`);
          }
        }
        return;
      }
      process.stdout.write(USAGE);
      process.exit(1);
      return;
    }
    case 'trust': {
      // `trust <mac|ios|android>`: here `dir` is the sub-command. Each one changes a trust store only when named.
      const say = (line = ''): void => void process.stdout.write(`${line}\n`);
      if (dir === 'mac') trustMac(realRunner, say);
      else if (dir === 'ios') trustIos(realRunner, say, values.device);
      else if (dir === 'android') trustAndroid(realRunner, say, values.serial);
      else {
        process.stdout.write(USAGE);
        process.exit(1);
      }
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
