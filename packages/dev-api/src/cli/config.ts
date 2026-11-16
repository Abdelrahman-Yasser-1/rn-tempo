import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

import { defineConfig, type ApiConfig, type ApiConfigInput } from '@rn-tempo/api-contract';
import { createJiti } from 'jiti';

/** The nearest `tsconfig.json` at or above a folder, for `paths` aliases such as `@features/*`. */
export function findTsconfig(from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) return candidate;
    if (dir === parse(dir).root) return undefined;
  }
}

function isApiConfig(value: unknown): value is ApiConfig {
  return typeof value === 'object' && value !== null && 'resources' in value && 'basePath' in value;
}

/**
 * Loads a TypeScript config file. jiti compiles it on the fly (no build step for the user), and
 * `tsconfigPaths` makes imports like `@features/products/schema` resolve the way the app's own
 * tsconfig says, so a config can import the app's Zod schemas.
 */
export async function loadConfig(configPath: string): Promise<ApiConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Create it, or pass --config <file>.`);
  }
  const tsconfig = findTsconfig(dirname(configPath));
  const jiti = createJiti(import.meta.url, {
    // Re-read the file on every start, so edits are picked up without a stale cache.
    moduleCache: false,
    fsCache: false,
    interopDefault: true,
    ...(tsconfig === undefined ? {} : { tsconfigPaths: tsconfig }),
  });
  const loaded = await jiti.import<unknown>(configPath, { default: true });
  if (isApiConfig(loaded)) return loaded;
  if (typeof loaded === 'object' && loaded !== null && 'endpoints' in loaded) {
    return defineConfig(loaded as ApiConfigInput);
  }
  throw new Error(`${configPath} must default-export the result of defineConfig({ endpoints: [...] }).`);
}
