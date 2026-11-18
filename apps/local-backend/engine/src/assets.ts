import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as sea from 'node:sea';

import { swaggerDir } from '@rn-tempo/dev-api';

/** The two places a bundled file can come from. Passed in by tests; the defaults are the real ones. */
export interface AssetSources {
  isSea: () => boolean;
  /** Reads an asset embedded in the single executable. Throws when the key does not exist. */
  getAsset: (key: string) => ArrayBuffer;
  /** Reads a Swagger UI file from the `swagger-ui-dist` folder (the path when the engine runs from source or the bundle). */
  fromDisk: (name: string) => Buffer;
}

const REAL: AssetSources = {
  isSea: () => sea.isSea(),
  getAsset: (key) => sea.getAsset(key),
  fromDisk: (name) => readFileSync(join(swaggerDir(), name)),
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
