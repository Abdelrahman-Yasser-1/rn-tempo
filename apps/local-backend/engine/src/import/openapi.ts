import { createHash } from 'node:crypto';

import { endpointId } from '@rn-tempo/api-contract';
import { parse as parseYaml } from 'yaml';

import { DefinitionError, EndpointSchema, type HttpMethod } from '../schema.ts';

import { generateFromSchema } from './generate.ts';
import { swagger2ToOpenApi3 } from './swagger2.ts';

type Json = Record<string, unknown>;

export type ImportFormat = 'openapi-3.0' | 'openapi-3.1' | 'swagger-2.0';

/** One endpoint as an import makes it, before it is stored. `importedFrom` is its fingerprint. */
export type ImportedEndpoint = Json & { id: string; type: 'static'; method: HttpMethod; path: string; importedFrom: string };

export interface ImportedApi {
  /** `info.title`, for naming a new backend. */
  title: string | undefined;
  /** The base path of the first server (`/api/v1`), when it has one. */
  basePath: string | undefined;
  format: ImportFormat;
  /** SHA-256 of the file text. */
  hash: string;
  endpoints: ImportedEndpoint[];
  /** What was skipped or changed on the way, in plain words. */
  warnings: string[];
}

const METHODS: Record<string, HttpMethod> = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE' };
/** Keys of an OpenAPI schema that JSON Schema does not know. */
const OPENAPI_ONLY = ['xml', 'discriminator', 'externalDocs', 'deprecated', 'readOnly', 'writeOnly'];
const MAX_DEPTH = 24;
/**
 * Total nodes `resolve` may produce in one import. Shared `$ref`s are copied at every use, so a small file whose
 * refs fan out (each ref used many times by the next) would otherwise expand exponentially.
 */
export const MAX_RESOLVED_NODES = 200_000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

interface Budget {
  left: number;
}

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads an API description from JSON or YAML text. `.yaml` and `.yml` are YAML; anything else is tried as JSON first. */
export function parseApiText(text: string, file: string): unknown {
  const yaml = /\.ya?ml$/i.test(file);
  if (!yaml) {
    try {
      return JSON.parse(text);
    } catch {
      // not JSON: YAML is a superset, so try it before giving up
    }
  }
  try {
    return parseYaml(text, { maxAliasCount: 100 });
  } catch (error) {
    throw new DefinitionError(`${file} is neither valid JSON nor valid YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}

/** Follows `#/a/b` inside the document. Only local references are supported. */
function pointer(doc: Json, ref: string): unknown {
  let node: unknown = doc;
  for (const raw of ref.slice(2).split('/')) {
    let key: string;
    try {
      key = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');
    } catch {
      return undefined;
    }
    if (!isObject(node) && !Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/**
 * Copies a value with every local `$ref` replaced by what it points to. A reference to itself becomes `{}` (any).
 * Every node costs one unit of the budget, so a document whose references fan out stops with an error.
 */
function resolve(doc: Json, value: unknown, warnings: string[], budget: Budget, trail: readonly string[] = [], depth = 0): unknown {
  budget.left -= 1;
  if (budget.left < 0) {
    throw new DefinitionError(`This API file expands to more than ${String(MAX_RESOLVED_NODES)} schema nodes once its $refs are resolved; it is too large or its references fan out too much to import.`);
  }
  if (depth > MAX_DEPTH) return {};
  if (Array.isArray(value)) return value.map((item) => resolve(doc, item, warnings, budget, trail, depth + 1));
  if (!isObject(value)) return value;
  if (typeof value.$ref === 'string') {
    const ref = value.$ref;
    if (!ref.startsWith('#/')) {
      warnings.push(`Reference ${ref} is not local and was replaced by "any".`);
      return {};
    }
    if (trail.includes(ref)) {
      warnings.push(`Reference ${ref} is recursive and was cut to "any" at the second level.`);
      return {};
    }
    return resolve(doc, pointer(doc, ref) ?? {}, warnings, budget, [...trail, ref], depth + 1);
  }
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) out[key] = resolve(doc, child, warnings, budget, trail, depth + 1);
  return out;
}

/**
 * The schema as JSON Schema 2020-12: 3.0's `nullable: true` becomes a `null` type, `exclusiveMinimum: true` becomes a
 * number, `example` becomes `examples`, and OpenAPI-only keys go.
 */
export function toJsonSchema(value: unknown): Json {
  if (Array.isArray(value)) return value.map(toJsonSchema) as unknown as Json;
  if (!isObject(value)) return value as Json;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (OPENAPI_ONLY.includes(key)) continue;
    if (key === 'example') {
      out.examples = [child];
      continue;
    }
    // Property maps hold user names, which must never be mistaken for keywords.
    out[key] = key === 'properties' && isObject(child) ? Object.fromEntries(Object.entries(child).map(([k, v]) => [k, toJsonSchema(v)])) : toJsonSchema(child);
  }
  for (const [flag, limit, bound] of [['exclusiveMinimum', 'minimum', 'exclusiveMinimum'], ['exclusiveMaximum', 'maximum', 'exclusiveMaximum']] as const) {
    if (out[flag] === true && typeof out[limit] === 'number') {
      out[bound] = out[limit];
      delete out[limit];
    } else if (out[flag] === true || out[flag] === false) delete out[flag];
  }
  if (out.nullable === true) {
    delete out.nullable;
    if (typeof out.type === 'string') out.type = [out.type, 'null'];
    else if (Array.isArray(out.type)) out.type = [...new Set([...(out.type as string[]), 'null'])];
    else return { anyOf: [out, { type: 'null' }] };
  } else delete out.nullable;
  return out;
}

/** `{id}` to `:id`; names are cut down to what the router reads (letters, digits, `_`). */
function expressPath(raw: string): { path: string; names: Record<string, string> } | undefined {
  const names: Record<string, string> = {};
  const segments = raw.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    const part = segments[i] ?? '';
    const whole = /^\{([^}]+)\}$/.exec(part);
    if (whole !== null) {
      const original = whole[1] ?? '';
      const safe = original.replace(/[^A-Za-z0-9_]/g, '_');
      names[original] = safe;
      segments[i] = `:${safe}`;
    } else if (part.includes('{')) return undefined;
  }
  const joined = segments.join('/');
  const trimmed = joined.length > 1 ? joined.replace(/\/+$/, '') : joined;
  return { path: trimmed === '' ? '/' : trimmed, names };
}

const isJsonType = (type: string): boolean => /^application\/(.+\+)?json/i.test(type);

/** The JSON media type of a `content` map: schema and the first example. */
function pickJson(content: unknown): { schema?: Json; example?: unknown; hasOther: boolean } | undefined {
  if (!isObject(content)) return undefined;
  const types = Object.keys(content);
  const key = types.find(isJsonType) ?? types.find((type) => type === '*/*');
  const media = key === undefined ? undefined : content[key];
  if (!isObject(media)) return types.length === 0 ? undefined : { hasOther: true };
  const examples = isObject(media.examples) ? Object.values(media.examples) : [];
  const first = examples.map((entry) => (isObject(entry) ? entry.value : undefined)).find((value) => value !== undefined);
  const schema = isObject(media.schema) ? media.schema : undefined;
  const example = media.example ?? first ?? (isObject(schema) ? schema.example : undefined);
  return { ...(schema === undefined ? {} : { schema: toJsonSchema(schema) }), ...(example === undefined ? {} : { example }), hasOther: types.some((type) => type !== key) };
}

function parametersOf(pathItem: Json, operation: Json): Json[] {
  const merged = new Map<string, Json>();
  for (const list of [pathItem.parameters, operation.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const parameter of list) {
      if (isObject(parameter) && typeof parameter.name === 'string' && typeof parameter.in === 'string') merged.set(`${parameter.in}:${parameter.name}`, parameter);
    }
  }
  return [...merged.values()];
}

function objectSchema(parameters: Json[], rename: Record<string, string>): Json | undefined {
  if (parameters.length === 0) return undefined;
  const properties: Json = {};
  const required: string[] = [];
  for (const parameter of parameters) {
    const original = String(parameter.name);
    const name = rename[original] ?? original;
    properties[name] = isObject(parameter.schema) ? toJsonSchema(parameter.schema) : { type: 'string' };
    if (parameter.required === true || parameter.in === 'path') required.push(name);
  }
  return { type: 'object', properties, ...(required.length === 0 ? {} : { required }) };
}

/** The base path of the first server URL, when it has one (`https://host/api/v1` gives `/api/v1`). */
function basePathOf(doc: Json): string | undefined {
  const servers = doc.servers;
  const url = Array.isArray(servers) && isObject(servers[0]) && typeof servers[0].url === 'string' ? servers[0].url : undefined;
  if (url === undefined || url.includes('{')) return undefined;
  let path = url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    try {
      path = new URL(url).pathname;
    } catch {
      return undefined;
    }
  }
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' || !trimmed.startsWith('/') || !/^(\/[A-Za-z0-9._~-]+)+$/.test(trimmed) ? undefined : trimmed;
}

/** Whether an operation needs sign-in, from its (or the document's) security requirements. */
function needsAuth(requirements: unknown, schemes: Json, label: string, warnings: string[]): boolean {
  if (!Array.isArray(requirements) || requirements.length === 0) return false;
  const objects = requirements.filter(isObject);
  // `{}` in the list means the operation may be called without any of the others.
  if (objects.some((requirement) => Object.keys(requirement).length === 0)) return false;
  for (const requirement of objects) {
    for (const name of Object.keys(requirement)) {
      const scheme = schemes[name];
      const type = isObject(scheme) ? scheme.type : undefined;
      if (type === 'apiKey') warnings.push(`${label} uses an API key (${name}). The backend has no API key sign-in, so it needs a bearer token instead.`);
      else if (type === 'http' && isObject(scheme) && String(scheme.scheme).toLowerCase() === 'basic') warnings.push(`${label} uses basic authentication. The backend has no basic sign-in, so it needs a bearer token instead.`);
    }
  }
  return objects.length > 0;
}

const camel = (text: string): string => {
  const words = text.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  return words.map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1))).join('');
};

interface ScenarioOut {
  status: number;
  description?: string;
  schema?: Json;
  body?: unknown;
}

/** The status of a response key (`200`, `4XX`, `default`) and whether it is a range or the catch-all. */
function statusOf(code: string): number | undefined {
  if (/^[1-5]\d\d$/.test(code)) return Number(code);
  const range = /^([1-5])XX$/i.exec(code);
  if (range !== null) return Number(range[1]) * 100;
  return code === 'default' ? 500 : undefined;
}

function scenariosOf(id: string, responses: unknown, label: string, warnings: string[]): { scenarios: Record<string, ScenarioOut>; names: string[] } {
  const scenarios: Record<string, ScenarioOut> = {};
  const names: string[] = [];
  if (!isObject(responses)) return { scenarios, names };
  const explicit = new Set(Object.keys(responses).filter((code) => /^[1-5]\d\d$/.test(code)));
  for (const [code, rawResponse] of Object.entries(responses)) {
    const status = statusOf(code);
    if (status === undefined) continue;
    if (/^[1-5]XX$/i.test(code) && explicit.has(String(status))) continue;
    const response = isObject(rawResponse) ? rawResponse : {};
    if (isObject(response.links) && Object.keys(response.links).length > 0) warnings.push(`Links of ${label} (${code}) are not supported and were skipped.`);
    const description = typeof response.description === 'string' ? response.description.trim() : '';
    const suffix = camel(description).slice(0, 30);
    let name = suffix === '' ? code : `${code} ${suffix}`;
    for (let n = 2; scenarios[name] !== undefined; n += 1) name = `${code} ${suffix === '' ? '' : `${suffix} `}${String(n)}`.trim();
    const picked = pickJson(response.content);
    if (picked?.hasOther === true && picked.schema === undefined && picked.example === undefined) warnings.push(`${label} ${code} answers a type other than JSON; it is imported without a body.`);
    let body: unknown;
    if (status !== 204 && status !== 304) {
      body = picked?.example;
      if (body === undefined && picked?.schema !== undefined) body = generateFromSchema(picked.schema, `${id}|${name}`);
    }
    scenarios[name] = { status, ...(description === '' ? {} : { description: description.slice(0, 500) }), ...(picked?.schema === undefined ? {} : { schema: picked.schema }), ...(body === undefined ? {} : { body }) };
    names.push(name);
  }
  return { scenarios, names };
}

/** Sorted-key JSON, so the same value always gives the same text. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/**
 * The fingerprint of an endpoint: a hash of its definition without `importedFrom`, and without empty settings that a
 * form may write or leave out (`auth: "none"`, `{}`, `[]`), so saving an endpoint unchanged does not count as an edit.
 */
export function fingerprint(endpoint: Json): string {
  const kept: Json = {};
  for (const [key, value] of Object.entries(endpoint)) {
    if (key === 'importedFrom' || value === undefined) continue;
    if (key !== 'body' && ((Array.isArray(value) && value.length === 0) || (isObject(value) && Object.keys(value).length === 0))) continue;
    if (key === 'auth' && value === 'none') continue;
    kept[key] = value;
  }
  return createHash('sha256').update(stableJson(kept)).digest('hex').slice(0, 32);
}

/** What kind of file this is, or an error naming what is wrong. */
export function detectFormat(doc: unknown): ImportFormat {
  if (!isObject(doc)) throw new DefinitionError('This is not an API description: expected a JSON or YAML object.');
  if (typeof doc.swagger === 'string') {
    if (!doc.swagger.startsWith('2.')) throw new DefinitionError(`Swagger ${doc.swagger} is not supported; use 2.0.`);
    return 'swagger-2.0';
  }
  if (typeof doc.openapi !== 'string') throw new DefinitionError('This is not an OpenAPI or Swagger file (it has neither "openapi" nor "swagger").');
  if (/^3\.0(\.|$)/.test(doc.openapi)) return 'openapi-3.0';
  if (/^3\.1(\.|$)/.test(doc.openapi)) return 'openapi-3.1';
  throw new DefinitionError(`OpenAPI ${doc.openapi} is not supported; use 3.0, 3.1 or Swagger 2.0.`);
}

/** Turns an OpenAPI 3.x or Swagger 2.0 document (already parsed) into endpoints. Unsupported parts are skipped with a warning. */
export function importApi(input: unknown, text: string): ImportedApi {
  const format = detectFormat(input);
  const warnings: string[] = [];
  const doc = format === 'swagger-2.0' ? swagger2ToOpenApi3(input as Json) : (input as Json);
  const components = isObject(doc.components) ? doc.components : {};
  const schemes = isObject(components.securitySchemes) ? components.securitySchemes : {};
  const paths = isObject(doc.paths) ? doc.paths : {};
  if (isObject(doc.webhooks) && Object.keys(doc.webhooks).length > 0) warnings.push('Webhooks are not supported and were skipped.');
  const endpoints: ImportedEndpoint[] = [];
  const ids = new Set<string>();
  const routes = new Set<string>();
  const budget: Budget = { left: MAX_RESOLVED_NODES };
  let sawHeaders = false;
  let sawFormBody = false;

  for (const [rawPath, rawItem] of Object.entries(paths)) {
    const item = resolve(doc, rawItem, warnings, budget);
    if (!isObject(item)) continue;
    for (const [verb, rawOperation] of Object.entries(item)) {
      const method = METHODS[verb];
      if (method === undefined) {
        if (['head', 'options', 'trace'].includes(verb)) warnings.push(`${verb.toUpperCase()} ${rawPath} is not supported and was skipped.`);
        continue;
      }
      if (!isObject(rawOperation)) continue;
      const operation = rawOperation;
      const label = `${method} ${rawPath}`;
      const converted = expressPath(rawPath);
      if (converted === undefined) {
        warnings.push(`${label} mixes text and a parameter in one path segment, which the backend cannot route; it was skipped.`);
        continue;
      }
      const { path, names } = converted;
      const route = `${method} ${path.replace(/:[A-Za-z0-9_]+/g, ':')}`;
      if (routes.has(route)) {
        warnings.push(`${label} answers the same route as another operation; it was skipped.`);
        continue;
      }
      let id = typeof operation.operationId === 'string' && operation.operationId.trim() !== '' ? operation.operationId.trim().slice(0, 190) : endpointId(method, path);
      const base = id;
      for (let n = 2; ids.has(id); n += 1) id = `${base}.${String(n)}`;
      if (id !== base) warnings.push(`${label} repeats the operation id "${base}"; it became "${id}".`);
      if (isObject(operation.callbacks) && Object.keys(operation.callbacks).length > 0) warnings.push(`Callbacks of ${label} are not supported and were skipped.`);

      const parameters = parametersOf(item, operation);
      if (parameters.some((parameter) => parameter.in === 'header' || parameter.in === 'cookie')) sawHeaders = true;
      const params = objectSchema(parameters.filter((p) => p.in === 'path'), names);
      const query = objectSchema(parameters.filter((p) => p.in === 'query'), {});
      const requestBody = isObject(operation.requestBody) ? operation.requestBody : undefined;
      const picked = pickJson(requestBody?.content);
      if (requestBody !== undefined && picked?.schema === undefined && isObject(requestBody.content) && Object.keys(requestBody.content).length > 0) sawFormBody = true;
      const request = {
        ...(params === undefined ? {} : { params }),
        ...(query === undefined ? {} : { query }),
        ...(picked?.schema === undefined ? {} : { body: picked.schema, ...(requestBody?.required === true ? { bodyRequired: true } : {}) }),
      };

      const { scenarios, names: scenarioNames } = scenariosOf(id, operation.responses, label, warnings);
      const defaultName = scenarioNames.find((name) => {
        const status = scenarios[name]?.status ?? 0;
        return status >= 200 && status < 300;
      });
      if (defaultName === undefined) warnings.push(`${label} has no 2xx response; it answers 200 with an empty object.`);
      const chosen = defaultName === undefined ? undefined : scenarios[defaultName];
      const tags = Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === 'string') : [];
      const authed = needsAuth(operation.security ?? doc.security, schemes, label, warnings);

      const draft: Json = {
        id,
        type: 'static',
        method,
        path,
        ...(typeof operation.summary === 'string' && operation.summary.trim() !== '' ? { summary: operation.summary.trim().slice(0, 300) } : {}),
        ...(tags.length === 0 ? {} : { tags }),
        ...(authed ? { auth: 'bearer' } : {}),
        status: chosen?.status ?? 200,
        ...(chosen === undefined ? { body: {} } : chosen.body === undefined ? {} : { body: chosen.body }),
        ...(Object.keys(request).length === 0 ? {} : { request }),
        ...(scenarioNames.length === 0 ? {} : { scenarios: scenarios as unknown as Json }),
      };
      const checked = EndpointSchema.safeParse({ ...draft, importedFrom: 'x' });
      if (!checked.success) {
        const first = checked.error.issues[0];
        warnings.push(`${label} was skipped: ${first?.path.join('.') ?? 'endpoint'}: ${first?.message ?? 'invalid'}`);
        continue;
      }
      ids.add(id);
      routes.add(route);
      endpoints.push({ ...draft, importedFrom: fingerprint(draft) } as ImportedEndpoint);
    }
  }
  if (sawHeaders) warnings.push('Header and cookie parameters are documented only; the backend does not check them.');
  if (sawFormBody) warnings.push('Request bodies that are not JSON (forms, files) are not validated.');

  const info = isObject(doc.info) ? doc.info : {};
  const basePath = basePathOf(doc);
  return {
    title: typeof info.title === 'string' && info.title.trim() !== '' ? info.title.trim().slice(0, 100) : undefined,
    ...(basePath === undefined ? { basePath: undefined } : { basePath }),
    format,
    hash: createHash('sha256').update(text).digest('hex'),
    endpoints,
    warnings: [...new Set(warnings)],
  };
}

/** Parses text and imports it. `file` is a name or URL, which decides JSON or YAML when the text is not plain JSON. */
export function importApiText(text: string, file: string): ImportedApi {
  if (text.length > MAX_IMPORT_BYTES) throw new DefinitionError('That file is larger than 10 MB.');
  return importApi(parseApiText(text, file), text);
}
