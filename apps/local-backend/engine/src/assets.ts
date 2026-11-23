import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sea from 'node:sea';

import { swaggerDir } from './shared/swagger.ts';

/** The two places a bundled file can come from. Passed in by tests; the defaults are the real ones. */
export interface AssetSources {
  isSea: () => boolean;
  /** Reads an asset embedded in the single executable. Throws when the key does not exist. */
  getAsset: (key: string) => ArrayBuffer;
  /** Reads a Swagger UI file from the `swagger-ui-dist` folder (the path when the engine runs from source or the bundle). */
  fromDisk: (name: string) => Buffer;
  /** Reads a dashboard file from the `dashboard` folder next to `dist` and `src`. Throws when it does not exist. */
  dashboardFromDisk?: (name: string) => Buffer;
}

const DASHBOARD_DIR = fileURLToPath(new URL('../dashboard/', import.meta.url));

const REAL: AssetSources = {
  isSea: () => sea.isSea(),
  getAsset: (key) => sea.getAsset(key),
  fromDisk: (name) => readFileSync(join(swaggerDir(), name)),
  dashboardFromDisk: (name) => readFileSync(join(DASHBOARD_DIR, name)),
};

/** The key a Swagger UI file has inside the single executable (`sea-config.json` `assets`). */
export const swaggerAssetKey = (name: string): string => `swagger-ui/${name}`;

/**
 * The one place that reads files the engine ships with. As a single executable they are SEA assets; from source
 * or the plain bundle they are read from disk. `name` must be a fixed file name, never a path from a request.
 */
export function readSwaggerAsset(name: string, sources: AssetSources = REAL): Buffer {
  if (sources.isSea()) return Buffer.from(sources.getAsset(swaggerAssetKey(name)));
  return sources.fromDisk(name);
}

/** The key a dashboard file has inside the single executable. `name` is a path relative to the web build, such as `assets/index-x.js`. */
export const dashboardAssetKey = (name: string): string => `dashboard/${name}`;

/**
 * Reads a file of the web dashboard (the Vite web build copied into the engine package). In the single executable it
 * is a SEA asset; otherwise it is read from the package's `dashboard` folder. Returns `undefined` when there is no
 * such file, so a missing dashboard (an install without the web build) is a 404, not a crash. `name` must already be
 * checked by the caller: never a raw request path.
 */
export function readDashboardAsset(name: string, sources: AssetSources = REAL): Buffer | undefined {
  try {
    if (sources.isSea()) return Buffer.from(sources.getAsset(dashboardAssetKey(name)));
    return sources.dashboardFromDisk?.(name);
  } catch {
    return undefined;
  }
}
