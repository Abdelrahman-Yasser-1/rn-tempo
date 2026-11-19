import { lstatSync, readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join } from 'node:path';

import { readSwaggerAsset } from './assets.ts';
import type { Engine } from './engine.ts';
import type { RequestCtx } from './http.ts';
import { buildOpenApi } from './openapi.ts';
import { certsDirOf } from './server.ts';

const page = (prefix: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tempo Local Backend docs</title>
    <link rel="stylesheet" href="${prefix}/__docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${prefix}/__docs/swagger-ui-bundle.js"></script>
    <script src="${prefix}/__docs/swagger-initializer.js"></script>
  </body>
</html>
`;

const initializer = (prefix: string): string => `window.ui = SwaggerUIBundle({ url: '${prefix}/__docs/openapi.json', dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: false });
`;

/** The only Swagger UI files that are served, by fixed name; nothing is read from a path in the request. */
const ASSETS: Readonly<Record<string, string>> = {
  'swagger-ui.css': 'text/css',
  'swagger-ui-bundle.js': 'text/javascript',
  'favicon-16x16.png': 'image/png',
  'favicon-32x32.png': 'image/png',
};

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

/**
 * `/__docs` (Swagger UI) and `/__docs/openapi.json` on the public listener. It is documentation only: the
 * document is built from the running definition, so it follows every hot reload.
 */
export function docsHandler(engine: Engine): (ctx: RequestCtx, res: ServerResponse) => boolean {
  const send = (res: ServerResponse, type: string, body: string | Buffer, head: boolean): boolean => {
    res.writeHead(200, { 'content-type': type, 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' });
    res.end(head ? undefined : body);
    return true;
  };
  return (ctx, res) => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return false;
    const head = ctx.method === 'HEAD';
    const path = ctx.path.replace(/\/+$/, '');
    if (path === '/__docs' || path === '/__docs/index.html') return send(res, 'text/html; charset=utf-8', page(engine.publicPrefix), head);
    if (path === '/__docs/openapi.json') return send(res, 'application/json; charset=utf-8', `${JSON.stringify(buildOpenApi(engine.definition, { prefix: engine.publicPrefix }), null, 2)}\n`, head);
    if (path === '/__ca.pem') {
      // The PUBLIC half of the local CA, so a phone can install it. The file is read by fixed name and must be a plain file.
      try {
        const file = join(certsDirOf(engine), 'rootCA.pem');
        if (!lstatSync(file).isFile()) return false;
        return send(res, 'application/x-pem-file', readFileSync(file), head);
      } catch {
        return false;
      }
    }
    if (path === '/__docs/swagger-initializer.js') return send(res, 'text/javascript', initializer(engine.publicPrefix), head);
    const name = path.startsWith('/__docs/') ? path.slice('/__docs/'.length) : undefined;
    const type = name === undefined ? undefined : ASSETS[name];
    if (name === undefined || type === undefined) return false;
    try {
      return send(res, type, readSwaggerAsset(name), head);
    } catch {
      return false;
    }
  };
}
