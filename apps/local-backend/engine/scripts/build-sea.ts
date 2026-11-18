// Builds the engine as a Node single executable (SEA): one file with every dependency inlined, plus the Swagger UI
// files as SEA assets. The result goes where Tauri's `bundle.externalBin` looks for it:
//   apps/local-backend/app/src-tauri/binaries/tempo-engine-<target-triple>
// Needs Node 25.5 or newer (`node --build-sea`) and runs on the machine it builds for (no cross builds).
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binariesDir = resolve(engineDir, '../app/src-tauri/binaries');
const SWAGGER_FILES = ['swagger-ui.css', 'swagger-ui-bundle.js', 'favicon-16x16.png', 'favicon-32x32.png'];

const run = (command: string, args: string[]): string => execFileSync(command, args, { cwd: engineDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

function targetTriple(): string {
  const fromRust = run('rustc', ['--print', 'host-tuple']).trim();
  if (fromRust === '') throw new Error('rustc did not print a target triple.');
  return fromRust;
}

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 25 || (major === 25 && minor < 5)) throw new Error(`build:sea needs Node 25.5 or newer for \`node --build-sea\` (this is ${process.version}).`);

// 1. One bundled file.
run('npx', ['tsdown', '-c', 'tsdown.sea.config.ts']);

// 2. The SEA config. Paths are absolute because the config is read from the working directory.
const swagger = dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));
const assets = Object.fromEntries(SWAGGER_FILES.map((file) => [`swagger-ui/${file}`, join(swagger, file)]));
const triple = targetTriple();
mkdirSync(binariesDir, { recursive: true });
const output = join(binariesDir, `tempo-engine-${triple}`);
const configPath = join(engineDir, 'dist-sea', 'sea-config.json');
writeFileSync(
  configPath,
  JSON.stringify(
    {
      main: join(engineDir, 'dist-sea', 'cli.mjs'),
      mainFormat: 'module',
      output,
      disableExperimentalSEAWarning: true,
      // The engine's own flags only: a NODE_OPTIONS from the user's shell must not change how it runs.
      execArgvExtension: 'none',
      assets,
    },
    null,
    2,
  ),
);

// 3. Build the executable.
run('node', ['--build-sea', configPath]);
chmodSync(output, 0o755);

// 4. macOS refuses to run a binary whose signature no longer matches its contents: drop the copied signature of the
// Node binary and sign again ad hoc (the bundle step signs the whole app later when there is an identity).
if (process.platform === 'darwin') {
  run('codesign', ['--remove-signature', output]);
  run('codesign', ['--sign', '-', output]);
}
process.stdout.write(`${output}\n`);
