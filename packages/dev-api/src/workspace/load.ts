import { readFileSync } from 'node:fs';

import { defineConfig, defineEndpoint, type ApiConfig, type EndpointDefinition, type Scenario } from '@rn-tempo/api-contract';
import { z } from 'zod';

import { parseWorkspace, type JsonSchema, type Workspace, type WorkspaceEndpoint } from './schema.ts';

export interface LoadedWorkspace {
  config: ApiConfig;
  /** Things worth telling the user that did not stop the server, such as an example that fails its schema. */
  warnings: string[];
}

type Schema = z.ZodType;

const asObject = (value: unknown): JsonSchema | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonSchema) : undefined;

/** A JSON Schema as Zod, using Zod's own reader. The schema is already checked to be an object. */
export function jsonSchemaToZod(schema: JsonSchema): Schema {
  return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
}

/**
 * One value of a path or query string. These arrive as text, so numbers are coerced and booleans
 * read `true`/`false`; everything else (strings, enums, formats) goes through Zod's reader.
 */
function textValue(schema: JsonSchema): Schema {
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  if (type === 'integer' || type === 'number') {
    let out = z.coerce.number();
    if (type === 'integer') out = out.int();
    if (typeof schema.minimum === 'number') out = out.min(schema.minimum);
    if (typeof schema.maximum === 'number') out = out.max(schema.maximum);
    return out;
  }
  if (type === 'boolean') return z.stringbool();
  return jsonSchemaToZod(schema);
}

/** The object schema for `request.params` or `request.query`. */
export function textObject(schema: JsonSchema): Schema {
  const properties = asObject(schema.properties) ?? {};
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const shape: Record<string, Schema> = {};
  for (const [name, raw] of Object.entries(properties)) {
    const value = textValue(asObject(raw) ?? {});
    shape[name] = required.has(name) ? value : value.optional();
  }
  return z.object(shape);
}

/**
 * The example to serve, or `undefined` for "generate data". An example that fails its own response
 * schema would make the server answer 500, so it is dropped with a warning. No schema and no example
 * means an empty object (nothing for a 204).
 */
export function usableExample(source: WorkspaceEndpoint, schema: Schema, warnings: string[]): unknown {
  const { response } = source;
  const example = response.example;
  if (example !== undefined && response.schema !== undefined) {
    const checked = schema.safeParse(example);
    if (!checked.success) {
      const first = checked.error.issues[0];
      warnings.push(
        `${source.id}: the example does not match the response schema (${first?.path.join('.') || 'root'}: ${first?.message ?? 'invalid'}). Data is generated instead.`,
      );
      return undefined;
    }
  }
  if (example === undefined && response.schema === undefined) return response.status === 204 ? undefined : {};
  return example;
}

/** The response schema as Zod: the given one, nothing for a 204, or any object. */
export function responseSchema(source: WorkspaceEndpoint): Schema {
  const { response } = source;
  if (response.schema !== undefined) return jsonSchemaToZod(response.schema);
  return response.status === 204 ? z.undefined() : z.record(z.string(), z.unknown());
}

function buildEndpoint(source: WorkspaceEndpoint, warnings: string[]): EndpointDefinition {
  const { request, response } = source;
  const schema = responseSchema(source);
  const example = usableExample(source, schema, warnings);
  const fixed = example;

  const scenarios: Record<string, Scenario> = {};
  for (const [name, scenario] of Object.entries(source.scenarios ?? {})) {
    scenarios[name] = {
      ...(scenario.status === undefined ? {} : { status: scenario.status }),
      ...(scenario.delayMs === undefined ? {} : { delayMs: scenario.delayMs }),
      ...(scenario.body === undefined ? {} : { body: scenario.body }),
    };
  }

  return defineEndpoint({
    id: source.id,
    method: source.method,
    path: source.path,
    status: response.status,
    response: schema,
    ...(request?.params === undefined ? {} : { params: textObject(request.params) }),
    ...(request?.query === undefined ? {} : { query: textObject(request.query) }),
    ...(request?.body === undefined ? {} : { body: jsonSchemaToZod(request.body) }),
    ...(source.auth === undefined ? {} : { auth: source.auth }),
    ...(source.summary === undefined ? {} : { summary: source.summary }),
    ...(source.tags === undefined ? {} : { tags: source.tags }),
    // A fixed example, or `data` left out so the seeded generator builds data from the schema.
    ...(fixed === undefined && !(response.status === 204 && response.schema === undefined)
      ? {}
      : { data: () => (fixed === undefined ? undefined : structuredClone(fixed)) }),
    scenarios,
  });
}

/** Builds the config the server reads from a validated workspace. */
export function workspaceToConfig(workspace: Workspace): LoadedWorkspace {
  const warnings: string[] = [];
  const endpoints = workspace.endpoints.map((endpoint) => buildEndpoint(endpoint, warnings));
  const config = defineConfig({
    endpoints,
    ...(workspace.basePath === undefined ? {} : { basePath: workspace.basePath }),
    ...(workspace.port === undefined ? {} : { port: workspace.port }),
    ...(workspace.seed === undefined ? {} : { seed: workspace.seed }),
    // A bearer endpoint needs a way to get a token: the dev API's mock login (`/auth/login`) provides one.
    auth: workspace.endpoints.some((endpoint) => endpoint.auth === 'bearer'),
  });
  return { config, warnings };
}

/** Reads and validates a `tempo-api.json` file. */
export function loadWorkspaceFile(file: string): Workspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseWorkspace(parsed, file);
}

export function loadWorkspace(file: string): LoadedWorkspace {
  return workspaceToConfig(loadWorkspaceFile(file));
}
