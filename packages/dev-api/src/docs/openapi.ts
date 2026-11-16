import type { ApiConfig, EndpointDefinition, HttpMethod } from '@rn-tempo/api-contract';
import { z } from 'zod';

import { generate } from '../generate/index.ts';
import { createRuntime } from '../runtime/pipeline.ts';
import { scenarioNames } from '../runtime/scenarios.ts';

/** A JSON value; the OpenAPI document is built from these only. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

export interface OpenApiOptions {
  title?: string;
  version?: string;
  description?: string;
}

const METHOD_ORDER: readonly HttpMethod[] = ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'];

const PROBLEM_SCHEMA: JsonObject = {
  type: 'object',
  description:
    'An RFC 9457 problem details object. `message` repeats `detail` for clients written against dummyjson errors.',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    message: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, message: { type: 'string' } },
        required: ['path', 'message'],
      },
    },
  },
  required: ['type', 'title', 'status'],
};

const STATUS_TEXT: Readonly<Record<number, string>> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** Sorts object keys deeply so the same input always prints the same text. Arrays keep their order. */
export function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: JsonObject = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key] as Json);
    return out;
  }
  return value;
}

/** `/products/:id` becomes `/products/{id}`. */
export function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** A readable PascalCase name from an endpoint id: `get.products.:id` becomes `GetProductsId`. */
function pascal(id: string): string {
  return id
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** The operation id: the endpoint id without the `:` of path params. */
export function operationId(endpoint: EndpointDefinition): string {
  return endpoint.id.replaceAll(':', '_');
}

/**
 * A JSON Schema for a Zod schema. OpenAPI 3.1 uses JSON Schema 2020-12, which is Zod's default
 * target. `io` picks the type a client sends (`input`) or receives (`output`). Things JSON Schema
 * cannot hold (dates, transforms) become `{}` instead of failing the whole document.
 */
function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonObject {
  const out = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
    reused: 'inline',
    override: ({ jsonSchema: node }) => {
      // `z.int()` adds the safe-integer range; it is noise in a document people read.
      if (node.type === 'integer') {
        if (node.minimum === Number.MIN_SAFE_INTEGER) delete node.minimum;
        if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
      }
    },
  }) as JsonObject;
  delete out.$schema;
  return out;
}

/**
 * Moves a schema into `components.schemas`. Nested `$defs` (named or recursive schemas) are lifted
 * too, and every `$ref` is rewritten to point at the components.
 */
function addComponent(components: JsonObject, name: string, schema: JsonObject): Json {
  const defs = (schema.$defs ?? {}) as JsonObject;
  const body = { ...schema };
  delete body.$defs;
  const rename = (ref: string): string => {
    if (ref === '#') return `#/components/schemas/${name}`;
    const def = /^#\/\$defs\/(.+)$/.exec(ref)?.[1];
    return def === undefined ? ref : `#/components/schemas/${name}_${def}`;
  };
  const rewrite = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value !== null && typeof value === 'object') {
      const out: JsonObject = {};
      for (const [key, inner] of Object.entries(value)) {
        out[key] = key === '$ref' && typeof inner === 'string' ? rename(inner) : rewrite(inner);
      }
      return out;
    }
    return value;
  };
  components[name] = rewrite(body);
  for (const [key, def] of Object.entries(defs)) components[`${name}_${key}`] = rewrite(def);
  return { $ref: `#/components/schemas/${name}` };
}

/** Field names whose values must never look like a credential, even in generated sample data. */
const SECRET_NAME = /pass(word|code)?$|secret|token|api[-_]?key|otp|pin$/i;

/**
 * Replaces the value of a secret-looking field with `<name>`. Examples come from a random
 * generator, and a random string under `password` reads (and scans) like a leaked credential.
 */
export function maskSecrets(value: Json, name = ''): Json {
  if (typeof value === 'string' && SECRET_NAME.test(name)) return `<${name}>`;
  if (Array.isArray(value)) return value.map((item) => maskSecrets(item, name));
  if (value !== null && typeof value === 'object') {
    const out: JsonObject = {};
    for (const [key, inner] of Object.entries(value)) out[key] = maskSecrets(inner, key);
    return out;
  }
  return value;
}

function example(endpoint: EndpointDefinition, part: 'body' | 'response', seed: number): Json | undefined {
  const schema = part === 'body' ? endpoint.body : endpoint.response;
  if (schema === undefined) return undefined;
  try {
    return maskSecrets(JSON.parse(JSON.stringify(generate(schema, { seed, key: `${endpoint.id}|example|${part}` }))) as Json);
  } catch {
    // An example is a nicety; a schema the generator cannot satisfy must not break the document.
    return undefined;
  }
}

function parameters(endpoint: EndpointDefinition): Json[] {
  const out: Json[] = [];
  const named = (schema: z.ZodType | undefined, where: 'path' | 'query'): void => {
    if (schema === undefined) return;
    const object = jsonSchema(schema, 'input');
    const properties = (object.properties ?? {}) as JsonObject;
    const required = new Set((object.required ?? []) as string[]);
    for (const name of Object.keys(properties).sort()) {
      out.push({ name, in: where, required: where === 'path' || required.has(name), schema: properties[name] as Json });
    }
  };
  named(endpoint.params, 'path');
  const declared = new Set(out.map((p) => (p as JsonObject).name));
  for (const [, name] of endpoint.path.matchAll(/:([A-Za-z0-9_]+)/g)) {
    if (name !== undefined && !declared.has(name)) out.push({ name, in: 'path', required: true, schema: { type: 'string' } });
  }
  named(endpoint.query, 'query');
  return out;
}

function operation(endpoint: EndpointDefinition, config: ApiConfig, components: JsonObject): JsonObject {
  const name = pascal(endpoint.id);
  const responses: JsonObject = {};

  const success = endpoint.status;
  if (success === 204) {
    responses['204'] = { description: STATUS_TEXT[204] ?? 'No Content' };
  } else {
    const content: JsonObject = {
      schema: addComponent(components, `${name}Response`, jsonSchema(endpoint.response, 'output')),
    };
    const sample = example(endpoint, 'response', config.seed);
    if (sample !== undefined) content.example = sample;
    responses[String(success)] = {
      description: STATUS_TEXT[success] ?? 'Success',
      content: { 'application/json': content },
    };
  }

  const problem = (description: string): JsonObject => ({
    description,
    content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
  });
  if (endpoint.body !== undefined || endpoint.query !== undefined || endpoint.params !== undefined) {
    responses['400'] = problem('The request failed validation. `errors` lists every invalid field.');
  }
  if (endpoint.auth === 'bearer') responses['401'] = problem('The access token is missing, wrong or expired.');

  // Scenarios with a status are documented responses; several of the same status share one entry.
  const byStatus = new Map<number, { names: string[]; body: Json | undefined }>();
  for (const [scenarioName, scenario] of Object.entries(endpoint.scenarios)) {
    const status = scenario.status ?? success;
    if (status === success && scenario.body === undefined) continue;
    const entry = byStatus.get(status) ?? { names: [], body: undefined };
    entry.names.push(scenarioName);
    if (scenario.body !== undefined && entry.body === undefined) entry.body = scenario.body as Json;
    byStatus.set(status, entry);
  }
  for (const [status, entry] of [...byStatus].sort((a, b) => a[0] - b[0])) {
    const key = String(status);
    const note = `Scenario ${entry.names.map((n) => `\`${n}\``).join(', ')} (header \`x-tempo-scenario\`).`;
    const existing = responses[key] as JsonObject | undefined;
    if (existing !== undefined) {
      existing.description = `${String(existing.description)} ${note}`;
      continue;
    }
    responses[key] =
      entry.body === undefined
        ? problem(`${STATUS_TEXT[status] ?? 'Response'}. ${note}`)
        : {
            description: `${STATUS_TEXT[status] ?? 'Response'}. ${note}`,
            content: { 'application/json': { example: entry.body } },
          };
  }

  const out: JsonObject = {
    operationId: operationId(endpoint),
    ...(endpoint.summary === undefined ? {} : { summary: endpoint.summary }),
    ...(endpoint.tags === undefined || endpoint.tags.length === 0 ? {} : { tags: [...endpoint.tags] }),
    description: `Scenarios: ${scenarioNames(endpoint).map((n) => `\`${n}\``).join(', ')}.`,
    responses,
  };
  const params = parameters(endpoint);
  if (params.length > 0) out.parameters = params;
  if (endpoint.body !== undefined) {
    const content: JsonObject = {
      schema: addComponent(components, `${name}Request`, jsonSchema(endpoint.body, 'input')),
    };
    const sample = example(endpoint, 'body', config.seed);
    if (sample !== undefined) content.example = sample;
    out.requestBody = { required: true, content: { 'application/json': content } };
  }
  if (endpoint.auth === 'bearer') out.security = [{ bearerAuth: [] }];
  return out;
}

/**
 * The OpenAPI 3.1 document of a config. The mock-auth endpoints are included when `auth` is on.
 * Keys are sorted, so the output is stable and a diff shows only real changes.
 */
export function buildOpenApi(config: ApiConfig, options: OpenApiOptions = {}): JsonObject {
  const endpoints = createRuntime(config).endpoints;
  const components: JsonObject = { Problem: PROBLEM_SCHEMA };
  const paths: JsonObject = {};
  const tags = new Set<string>();

  const sorted = [...endpoints].sort(
    (a, b) => a.path.localeCompare(b.path) || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method),
  );
  for (const endpoint of sorted) {
    const key = openApiPath(endpoint.path);
    const item = (paths[key] ?? {}) as JsonObject;
    item[endpoint.method.toLowerCase()] = operation(endpoint, config, components);
    paths[key] = item;
    for (const tag of endpoint.tags ?? []) tags.add(tag);
  }

  const document: JsonObject = {
    openapi: '3.1.0',
    info: {
      title: options.title ?? 'RN-TEMPO dev API',
      version: options.version ?? '1.0.0',
      description:
        options.description ??
        'Generated from the endpoint definitions in api/endpoints. A mock for local development: do not use its credentials or tokens anywhere else.',
    },
    servers: [{ url: config.basePath === '' ? '/' : config.basePath }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      schemas: components,
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
  };
  return sortKeys(document) as JsonObject;
}

/** The document as pretty JSON with a trailing newline. */
export function openApiText(config: ApiConfig, options?: OpenApiOptions): string {
  return `${JSON.stringify(buildOpenApi(config, options), null, 2)}\n`;
}
