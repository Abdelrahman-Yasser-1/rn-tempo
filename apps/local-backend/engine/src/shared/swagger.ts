import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The folder with the prebuilt Swagger UI files. The standalone build has no node_modules, so it
 * ships them in a `swagger-ui` folder next to the bundle; otherwise they come from `swagger-ui-dist`.
 */
export function swaggerDir(): string {
  const bundled = join(dirname(fileURLToPath(import.meta.url)), 'swagger-ui');
  if (existsSync(bundled)) return bundled;
  return dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));
}
