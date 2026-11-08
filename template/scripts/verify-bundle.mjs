// Dry-run production bundles for iOS and Android: proves Metro can resolve and transform the whole app.
// Slow, so it is not part of `yarn verify`; Renovate CI and dependency upgrades run it.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORMS = ['ios', 'android'];

/** Parses `--platform ios|android` and `--reset-cache`. Throws on anything else. */
export function parseArgs(argv) {
  const options = { platforms: [...PLATFORMS], resetCache: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--reset-cache') {
      options.resetCache = true;
    } else if (arg === '--platform') {
      const value = argv[index + 1];
      if (!PLATFORMS.includes(value)) {
        throw new Error(`--platform must be one of: ${PLATFORMS.join(', ')}`);
      }
      options.platforms = [value];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

/** The `yarn` arguments that bundle one platform into `outDir`. */
export function buildArgs(platform, outDir, resetCache) {
  return [
    'react-native',
    'bundle',
    '--platform',
    platform,
    '--dev',
    'false',
    '--entry-file',
    'index.js',
    '--bundle-output',
    join(outDir, `${platform}.bundle`),
    '--sourcemap-output',
    join(outDir, `${platform}.map`),
    ...(resetCache ? ['--reset-cache'] : []),
  ];
}

/** `3.2 MB`. */
export function formatSize(bytes) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Single spawn point; yarn is resolved from PATH on purpose. */
function exec(command, args, options) {
  return spawnSync(command, args, options);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const outDir = mkdtempSync(join(tmpdir(), 'tempo-bundle-'));
  let failed = false;
  try {
    for (const platform of options.platforms) {
      console.log(`\n> bundling ${platform}`);
      const result = exec('yarn', buildArgs(platform, outDir, options.resetCache), {
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        console.error(`Bundle failed for ${platform}.`);
        failed = true;
        break;
      }
      const size = formatSize(statSync(join(outDir, `${platform}.bundle`)).size);
      console.log(`${platform} bundle: ${size}`);
    }
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
