import { endpointId, type HttpMethod } from '@rn-tempo/api-contract';
import { parse as parseYaml } from 'yaml';

import { parseWorkspace, type JsonSchema, type Workspace, type WorkspaceEndpoint } from './schema.ts';

export interface ImportResult {
  workspace: Workspace;
  warnings: string[];
}

type Json = Record<string, unknown>;

const METHODS: Record<string, HttpMethod> = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE' };
/** Keys of an OpenAPI schema that JSON Schema does not know. */
const OPENAPI_ONLY = ['xml', 'discriminator', 'externalDocs', 'example'];
const MAX_DEPTH = 24;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads an OpenAPI document from JSON or YAML text. `.yaml` and `.yml` are YAML; anything else is tried as JSON first. */
export function parseOpenApiText(text: string, file: string): unknown {
  const yaml = /\.ya?ml$/i.test(file);
  if (!yaml) {
    try {
      return JSON.parse(text);
    } catch {
      // not JSON: YAML is a superset, so try it before giving up
    }
  }
  try {
    return parseYaml(text);
  } catch (error) {
    throw new Error(`${file} is neither valid JSON nor valid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Follows `#/a/b` inside the document. Only local references are supported. */
function pointer(doc: Json, ref: string): unknown {
  let node: unknown = doc;
  for (const raw of ref.slice(2).split('/')) {
    const key = decodeURIComponent(raw).replaceAll('~1', '/').replaceAll('~0', '~');
    if (!isObject(node) && !Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/**
 * Copies a value with every local `$ref` replaced by what it points to, and OpenAPI 3.0 schema
 * dialect turned into JSON Schema 2020-12 (`nullable`). A reference to itself becomes `{}` (any).
 */
function resolve(doc: Json, value: unknown, warnings: string[], trail: readonly string[] = [], depth = 0): unknown {
  if (depth > MAX_DEPTH) return {};
  if (Array.isArray(value)) return value.map((item) => resolve(doc, item, warnings, trail, depth + 1));
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
    return resolve(doc, pointer(doc, ref) ?? {}, warnings, [...trail, ref], depth + 1);
  }
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) out[key] = resolve(doc, child, warnings, trail, depth + 1);
  return out;
}

/** The schema as JSON Schema 2020-12: 3.0's `nullable: true` becomes a `null` type, and OpenAPI-only keys go. */
function toJsonSchema(value: unknown): JsonSchema {
  if (Array.isArray(value)) return value.map(toJsonSchema) as unknown as JsonSchema;
  if (!isObject(value)) return value as JsonSchema;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (OPENAPI_ONLY.includes(key)) continue;
    // Property maps hold user names, which must never be mistaken for keywords.
    out[key] = key === 'properties' && isObject(child) ? Object.fromEntries(Object.entries(child).map(([k, v]) => [k, toJsonSchema(v)])) : toJsonSchema(child);
  }
  if (out.nullable === true) {
    delete out.nullable;
    if (typeof out.type === 'string') out.type = [out.type, 'null'];
    else if (Array.isArray(out.type)) out.type = [...new Set([...(out.type as string[]), 'null'])];
    else return { anyOf: [out, { type: 'null' }] };
  } else delete out.nullable;
  return out;
}

const expressPath = (path: string): string => path.replace(/\{([^}]+)\}/g, ':$1');

function pickJson(content: unknown): { schema?: JsonSchema; example?: unknown } | undefined {
  if (!isObject(content)) return undefined;
  const key = Object.keys(content).find((type) => /^application\/(.+\+)?json/.test(type)) ?? Object.keys(content).find((type) => type === '*/*');
  const media = key === undefined ? undefined : content[key];
  if (!isObject(media)) return undefined;
  const examples = isObject(media.examples) ? Object.values(media.examples) : [];
  const firstExample = examples.map((entry) => (isObject(entry) ? entry.value : undefined)).find((value) => value !== undefined);
  const schema = isObject(media.schema) ? media.schema : undefined;
  const example = media.example ?? firstExample ?? schema?.example;
  return {
    ...(schema === undefined ? {} : { schema: toJsonSchema(schema) }),
    ...(example === undefined ? {} : { example }),
  };
}

/** The first 2xx response, lowest status first. */
function successResponse(responses: unknown): { status: number; schema?: JsonSchema; example?: unknown } | undefined {
  if (!isObject(responses)) return undefined;
  const status = Object.keys(responses)
    .filter((code) => /^2\d\d$/.test(code))
    .map(Number)
    .sort((a, b) => a - b)[0];
  if (status === undefined) return undefined;
  const picked = pickJson(isObject(responses[String(status)]) ? (responses[String(status)] as Json).content : undefined);
  return { status, ...picked };
}

function parametersOf(pathItem: Json, operation: Json): Json[] {
  const merged = new Map<string, Json>();
  for (const list of [pathItem.parameters, operation.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const parameter of list) {
      if (isObject(parameter) && typeof parameter.name === 'string' && typeof parameter.in === 'string') {
        merged.set(`${parameter.in}:${parameter.name}`, parameter);
      }
    }
  }
  return [...merged.values()];
}

function objectSchema(parameters: Json[]): JsonSchema | undefined {
  if (parameters.length === 0) return undefined;
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const parameter of parameters) {
    const name = String(parameter.name);
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
  const path = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? new URL(url).pathname : url;
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' || !trimmed.startsWith('/') ? undefined : trimmed;
}

const hasSecurity = (value: unknown): boolean =>
  Array.isArray(value) && value.some((requirement) => isObject(requirement) && Object.keys(requirement).length > 0);

/** Turns an OpenAPI 3.0 or 3.1 document into a workspace. Unsupported parts are skipped with a warning. */
export function importOpenApi(input: unknown, fallbackName = 'imported-api'): ImportResult {
  if (!isObject(input) || typeof input.openapi !== 'string') {
    throw new Error('This is not an OpenAPI document (no "openapi" version). Swagger 2.0 files are not supported; convert them to OpenAPI 3 first.');
  }
  if (!/^3\.[01]\./.test(input.openapi)) throw new Error(`OpenAPI ${input.openapi} is not supported; use 3.0 or 3.1.`);
  const warnings: string[] = [];
  const doc = input;
  const paths = isObject(doc.paths) ? doc.paths : {};
  const endpoints: WorkspaceEndpoint[] = [];
  const ids = new Set<string>();

  for (const [rawPath, rawItem] of Object.entries(paths)) {
    const item = resolve(doc, rawItem, warnings);
    if (!isObject(item)) continue;
    for (const [verb, rawOperation] of Object.entries(item)) {
      const method = METHODS[verb];
      if (method === undefined) {
        if (['head', 'options', 'trace'].includes(verb)) warnings.push(`${verb.toUpperCase()} ${rawPath} is not supported and was skipped.`);
        continue;
      }
      if (!isObject(rawOperation)) continue;
      const operation = rawOperation;
      const path = expressPath(rawPath);
      let id = endpointId(method, path);
      for (let n = 2; ids.has(id); n++) id = `${endpointId(method, path)}.${n}`;
      ids.add(id);

      const parameters = parametersOf(item, operation);
      const params = objectSchema(parameters.filter((p) => p.in === 'path'));
      const query = objectSchema(parameters.filter((p) => p.in === 'query'));
      const body = isObject(operation.requestBody) ? pickJson(operation.requestBody.content)?.schema : undefined;
      const success = successResponse(operation.responses);
      if (success === undefined) warnings.push(`${method} ${rawPath} has no 2xx response; it answers 200 with an empty object.`);
      const request = { ...(params === undefined ? {} : { params }), ...(query === undefined ? {} : { query }), ...(body === undefined ? {} : { body }) };
      const tags = Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === 'string') : [];
      endpoints.push({
        id,
        method,
        path,
        ...(typeof operation.summary === 'string' ? { summary: operation.summary } : {}),
        ...(tags.length === 0 ? {} : { tags }),
        ...(hasSecurity(operation.security ?? doc.security) ? { auth: 'bearer' as const } : {}),
        ...(Object.keys(request).length === 0 ? {} : { request }),
        response: {
          status: success?.status ?? 200,
          ...(success?.schema === undefined ? {} : { schema: success.schema }),
          ...(success?.example === undefined ? {} : { example: success.example }),
        },
      });
    }
  }

  const info = isObject(doc.info) ? doc.info : {};
  const basePath = basePathOf(doc);
  const workspace = parseWorkspace(
    {
      name: typeof info.title === 'string' && info.title !== '' ? info.title : fallbackName,
      ...(basePath === undefined ? {} : { basePath }),
      endpoints,
    },
    'the imported workspace',
  );
  return { workspace, warnings: [...new Set(warnings)] };
}
