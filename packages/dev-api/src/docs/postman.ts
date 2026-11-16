import type { Json } from './openapi.ts';

type JsonObject = { [key: string]: Json };

export interface PostmanOptions {
  name?: string;
  /** Default of the `baseUrl` variable. */
  baseUrl?: string;
}

const COLLECTION_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';
const METHODS = ['get', 'put', 'post', 'patch', 'delete'] as const;

const obj = (value: Json | undefined): JsonObject => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** Fills `{id}` in a path with the variable `:id`, which Postman shows as an editable path variable. */
const postmanPath = (path: string): string[] => path.split('/').filter((s) => s !== '').map((s) => s.replace(/^\{(.+)\}$/, ':$1'));

function request(path: string, method: string, op: JsonObject, basePath: string): JsonObject {
  const segments = [...basePath.split('/').filter((s) => s !== ''), ...postmanPath(path)];
  const parameters = ((op.parameters ?? []) as Json[]).map(obj);
  const query = parameters
    .filter((p) => p.in === 'query')
    .map((p) => ({ key: p.name as string, value: '', disabled: p.required !== true }));
  const variable = parameters
    .filter((p) => p.in === 'path')
    .map((p) => ({ key: p.name as string, value: '1', description: (obj(p.schema).type as string | undefined) ?? 'string' }));
  const raw = `{{baseUrl}}/${segments.join('/')}${query.length > 0 ? `?${query.map((q) => `${q.key}=`).join('&')}` : ''}`;

  const out: JsonObject = {
    method: method.toUpperCase(),
    header: [] as Json[],
    url: { raw, host: ['{{baseUrl}}'], path: segments, ...(query.length > 0 ? { query } : {}), ...(variable.length > 0 ? { variable } : {}) },
  };
  const body = obj(obj(obj(obj(op.requestBody).content)['application/json']));
  if (body.example !== undefined) {
    (out.header as Json[]).push({ key: 'Content-Type', value: 'application/json' });
    out.body = { mode: 'raw', raw: JSON.stringify(body.example, null, 2), options: { raw: { language: 'json' } } };
  }
  if (Array.isArray(op.security) && op.security.length > 0) {
    out.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] };
  }
  return out;
}

/** Saved example responses, so a collection shows what each endpoint returns before it is sent. */
function savedResponses(op: JsonObject, req: JsonObject): Json[] {
  const out: Json[] = [];
  for (const [status, response] of Object.entries(obj(op.responses))) {
    const content = obj(obj(response).content);
    const media = obj(content['application/json']);
    if (media.example === undefined || Number(status) >= 400) continue;
    out.push({
      name: `${status} ${String(obj(response).description ?? '')}`.trim(),
      originalRequest: req,
      status: String(obj(response).description ?? ''),
      code: Number(status),
      _postman_previewlanguage: 'json',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      body: JSON.stringify(media.example, null, 2),
    });
  }
  return out;
}

/** Whether the success response holds an `accessToken`, so the request can save it for the others. */
function savesToken(op: JsonObject, components: JsonObject): boolean {
  for (const response of Object.values(obj(op.responses))) {
    const ref = obj(obj(obj(obj(response).content)['application/json']).schema).$ref;
    if (typeof ref !== 'string') continue;
    const schema = obj(components[ref.replace('#/components/schemas/', '')]);
    if ('accessToken' in obj(schema.properties)) return true;
  }
  return false;
}

/**
 * A Postman collection (v2.1) built from the OpenAPI document. It is written directly instead of
 * through `openapi-to-postmanv2`: that converter puts random ids in its output (so `api:check`
 * would never pass) and pulls in a large dependency tree. Folders are tags, requests carry the
 * example bodies of the document, and a login that returns an `accessToken` stores it in `token`.
 */
export function buildPostmanCollection(openapi: JsonObject, options: PostmanOptions = {}): JsonObject {
  const info = obj(openapi.info);
  const components = obj(obj(openapi.components).schemas);
  const server = obj((openapi.servers as Json[] | undefined)?.[0]).url;
  const basePath = typeof server === 'string' && server !== '/' ? server : '';
  const folders = new Map<string, Json[]>();

  for (const [path, item] of Object.entries(obj(openapi.paths))) {
    for (const method of METHODS) {
      const op = obj(obj(item)[method]);
      if (Object.keys(op).length === 0) continue;
      const req = request(path, method, op, basePath);
      const entry: JsonObject = {
        name: typeof op.summary === 'string' ? op.summary : `${method.toUpperCase()} ${path}`,
        request: req,
        response: savedResponses(op, req),
      };
      if (savesToken(op, components)) {
        entry.event = [
          {
            listen: 'test',
            script: {
              type: 'text/javascript',
              exec: ["const body = pm.response.json();", "if (body.accessToken) pm.environment.set('token', body.accessToken);"],
            },
          },
        ];
      }
      const folder = ((op.tags as string[] | undefined) ?? [])[0] ?? 'general';
      folders.set(folder, [...(folders.get(folder) ?? []), entry]);
    }
  }

  return {
    info: {
      name: options.name ?? String(info.title ?? 'RN-TEMPO dev API'),
      description: String(info.description ?? ''),
      schema: COLLECTION_SCHEMA,
    },
    item: [...folders].sort((a, b) => a[0].localeCompare(b[0])).map(([name, items]) => ({ name, item: items })),
    variable: [{ key: 'baseUrl', value: options.baseUrl ?? 'http://localhost:8443', type: 'string' }],
  };
}

/** The matching environment: `baseUrl` and an empty `token`. Nothing secret is written. */
export function buildPostmanEnvironment(options: PostmanOptions = {}): JsonObject {
  return {
    name: `${options.name ?? 'RN-TEMPO dev API'} (local)`,
    values: [
      { key: 'baseUrl', value: options.baseUrl ?? 'http://localhost:8443', type: 'default', enabled: true },
      { key: 'token', value: '', type: 'secret', enabled: true },
    ],
    _postman_variable_scope: 'environment',
  };
}
