// Copies the dev API's standalone build (one bundled tempo-api.mjs plus the Swagger UI files) into
// src-tauri/resources/standalone, where Tauri bundles it as a resource. Run after
// `yarn workspace @rn-tempo/dev-api build`; the Tauri build does both.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '../../../packages/dev-api/dist/standalone');
const to = join(here, '../src-tauri/resources/standalone');

if (!existsSync(join(from, 'tempo-api.mjs'))) {
  process.stderr.write(`No standalone build at ${from}. Run \`yarn workspace @rn-tempo/dev-api build\` first.\n`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });
process.stdout.write(`Copied the standalone dev API to ${to}\n`);
