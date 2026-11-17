import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ApiConfig } from '@rn-tempo/api-contract';
import express, { type Router } from 'express';

import { buildOpenApi } from '../docs/openapi.ts';

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dev API docs</title>
    <link rel="stylesheet" href="/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui-bundle.js"></script>
    <script src="/docs/swagger-initializer.js"></script>
  </body>
</html>
`;

const INITIALIZER = `window.ui = SwaggerUIBundle({
  url: '/docs/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  persistAuthorization: false,
});
`;

/**
 * The folder with the prebuilt Swagger UI files. The standalone build has no node_modules, so it
 * ships them in a `swagger-ui` folder next to the bundle; otherwise they come from `swagger-ui-dist`.
 */
function swaggerDir(): string {
  const bundled = join(dirname(fileURLToPath(import.meta.url)), 'swagger-ui');
  if (existsSync(bundled)) return bundled;
  return dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));
}

/**
 * Swagger UI at `/docs`, reading `/docs/openapi.json`. The document is built from the running
 * config, so it always matches what the server answers. Only the UI's static files are served; its
 * own `index.html` and initializer (which load a demo petstore) are replaced by the two above.
 */
export function docsRouter(config: ApiConfig): Router {
  const router = express.Router();
  const document = `${JSON.stringify(buildOpenApi(config), null, 2)}\n`;
  router.get('/openapi.json', (_req, res) => void res.type('application/json').send(document));
  router.get(['/', '/index.html'], (_req, res) => void res.type('html').send(PAGE));
  router.get('/swagger-initializer.js', (_req, res) => void res.type('js').send(INITIALIZER));
  const files = express.static(swaggerDir(), { index: false, dotfiles: 'ignore', redirect: false });
  // Only the UI's scripts, styles and icons; the package's other files are not part of the docs.
  router.use((req, res, next) => (/\.(css|js|png)$/.test(req.path) ? files(req, res, next) : next()));
  return router;
}
