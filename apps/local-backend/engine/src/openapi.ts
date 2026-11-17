import { openApiPath, sortKeys, type Json } from '@rn-tempo/dev-api';

import type { Backend, Collection, CrudEndpoint, Endpoint, Field } from './schema.ts';

type JsonObject = { [key: string]: Json };

const PROBLEM: JsonObject = {
  type: 'object',
  description: 'An RFC 9457 problem details object. `message` repeats `detail`.',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    message: { type: 'string' },
    errors: {
      type: 'array',
      items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } }, required: ['path', 'message'] },
    },
  },
  required: ['type', 'title', 'status'],
};

const STATUS_TEXT: Readonly<Record<number, string>> = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 429: 'Too Many Requests', 500: 'Internal Server Error',
  501: 'Not Implemented', 503: 'Service Unavailable',
};

const pascal = (text: string): string =>
  text.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

function baseSchema(field: Field): JsonObject {
  {
    switch (field.type) {
      case 'number':
        return { type: 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'enum':
        return { type: 'string', enum: field.enumValues ?? [] };
      case 'date':
        return { type: 'string', description: 'ISO 8601 date or date-time.' };
      case 'json':
        return { description: 'Any JSON value.' };
      case 'relation':
        return { type: 'integer', description: `The id of a record in "${field.relationTo ?? ''}".` };
      case 'media':
        return { type: 'string', description: 'A media id.' };
      default:
        return { type: 'string' };
    }
  }
}

function fieldSchema(field: Field): JsonObject {
  const base = baseSchema(field);
  if (field.default !== undefined) base.default = field.default as Json;
  return base;
}

/** The record as the API returns it (every field), and as it is sent (required fields without a default). */
function collectionSchemas(collection: Collection, hidden: ReadonlySet<string> = new Set()): { output: JsonObject; input: JsonObject } {
  const props: JsonObject = { id: { type: 'integer' } };
  const inputProps: JsonObject = {};
  const required: string[] = [];
  for (const field of collection.fields) {
    const schema = fieldSchema(field);
    inputProps[field.name] = schema;
    if (!hidden.has(field.name)) props[field.name] = field.required ? schema : { oneOf: [schema, { type: 'null' }] };
    if (field.required && field.default === undefined) required.push(field.name);
  }
  return {
    output: { type: 'object', properties: props, required: ['id'] },
    input: { type: 'object', properties: inputProps, additionalProperties: false, ...(required.length > 0 ? { required } : {}) },
  };
}

function problem(description: string): JsonObject {
  return { description, content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } };
}

function scenarioResponses(endpoint: Endpoint, responses: JsonObject, success: number): void {
  const byStatus = new Map<number, string[]>();
  for (const [name, scenario] of Object.entries(endpoint.scenarios)) {
    const status = scenario.status ?? success;
    if (status === success) continue;
    byStatus.set(status, [...(byStatus.get(status) ?? []), name]);
  }
  for (const [status, names] of [...byStatus].sort((a, b) => a[0] - b[0])) {
    const note = `Scenario ${names.map((name) => `\`${name}\``).join(', ')} (header \`x-tempo-scenario\`).`;
    const existing = responses[String(status)] as JsonObject | undefined;
    if (existing === undefined) responses[String(status)] = problem(`${STATUS_TEXT[status] ?? 'Response'}. ${note}`);
    else existing.description = `${String(existing.description)} ${note}`;
  }
}

function crudOperation(endpoint: CrudEndpoint, collection: Collection, name: string): JsonObject {
  const record: Json = { $ref: `#/components/schemas/${name}` };
  const input: Json = { $ref: `#/components/schemas/${name}Input` };
  const responses: JsonObject = {};
  const parameters: Json[] = [];
  const idParam: JsonObject = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
  const json = (schema: Json): JsonObject => ({ 'application/json': { schema } });
  let requestBody: JsonObject | undefined;
  let success = 200;
  switch (endpoint.action) {
    case 'list': {
      for (const [param, schema, description] of [
        ['limit', { type: 'integer', minimum: 0, default: endpoint.defaultLimit }, '0 returns every row.'],
        ['skip', { type: 'integer', minimum: 0 }, 'Rows to skip.'],
        ['page', { type: 'integer', minimum: 1 }, 'With pageSize: the 1-based page.'],
        ['pageSize', { type: 'integer', minimum: 1 }, 'Rows per page.'],
        ['sort', { type: 'string' }, 'A field, `-field` for descending, or a comma list.'],
        ['q', { type: 'string' }, 'Case-insensitive search over the searchable string fields.'],
      ] as [string, JsonObject, string][]) {
        parameters.push({ name: param, in: 'query', required: false, schema, description });
      }
      for (const field of collection.fields) {
        if (endpoint.hiddenFields.includes(field.name) || field.type === 'json') continue;
        parameters.push({ name: field.name, in: 'query', required: false, schema: fieldSchema(field), description: 'Equality filter.' });
      }
      const list: JsonObject =
        endpoint.listShape === 'paged'
          ? { type: 'object', properties: { items: { type: 'array', items: record }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } } }
          : { type: 'object', properties: { [collection.name]: { type: 'array', items: record }, total: { type: 'integer' }, skip: { type: 'integer' }, limit: { type: 'integer' } } };
      responses['200'] = { description: STATUS_TEXT[200] ?? 'OK', content: json(list) };
      responses['400'] = problem('A query parameter is invalid.');
      break;
    }
    case 'get':
      parameters.push(idParam);
      responses['200'] = { description: 'OK', content: json(record) };
      responses['404'] = problem('No record with that id.');
      break;
    case 'create':
      success = endpoint.successStatus ?? 201;
      requestBody = { required: true, content: json(input) };
      responses[String(success)] = { description: STATUS_TEXT[success] ?? 'Created', content: json(record) };
      responses['400'] = problem('The body failed validation. `errors` names every invalid field.');
      responses['409'] = problem('A unique field already holds that value.');
      break;
    case 'update':
      parameters.push(idParam);
      requestBody = { required: true, content: json(input) };
      responses['200'] = { description: 'OK', content: json(record) };
      responses['400'] = problem('The body failed validation.');
      responses['404'] = problem('No record with that id.');
      responses['409'] = problem('A unique field already holds that value.');
      break;
    case 'delete':
      parameters.push(idParam);
      responses['200'] = {
        description: endpoint.deleteMarkers ? 'The deleted record, with `isDeleted: true` and `deletedOn`.' : 'The deleted record.',
        content: json(record),
      };
      responses['404'] = problem('No record with that id.');
      break;
  }
  scenarioResponses(endpoint, responses, success);
  return { ...(parameters.length > 0 ? { parameters } : {}), ...(requestBody === undefined ? {} : { requestBody }), responses };
}

function operation(endpoint: Endpoint, collections: Map<string, Collection>): JsonObject {
  let body: JsonObject;
  if (endpoint.type === 'crud') {
    const collection = collections.get(endpoint.collection);
    body = collection === undefined ? { responses: {} } : crudOperation(endpoint, collection, pascal(collection.name));
  } else if (endpoint.type === 'static') {
    const responses: JsonObject = {
      [String(endpoint.status)]: {
        description: STATUS_TEXT[endpoint.status] ?? 'Response',
        ...(endpoint.body === undefined ? {} : { content: { 'application/json': { example: endpoint.body as Json } } }),
      },
    };
    scenarioResponses(endpoint, responses, endpoint.status);
    body = { responses };
  } else {
    body = { responses: { '501': problem(`The "${endpoint.type}" endpoint type is not available yet.`) } };
  }
  const params: Json[] = [...((body.parameters ?? []) as Json[])];
  for (const [, name] of endpoint.path.matchAll(/:([A-Za-z0-9_]+)/g)) {
    if (name !== undefined && !params.some((p) => (p as JsonObject).name === name && (p as JsonObject).in === 'path')) {
      params.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
  }
  const responses = body.responses as JsonObject;
  if (endpoint.auth === 'bearer') responses['401'] = problem('The access token is missing or wrong.');
  return {
    operationId: endpoint.id.replaceAll(':', '_'),
    ...(endpoint.summary === undefined ? {} : { summary: endpoint.summary }),
    ...(endpoint.tags === undefined || endpoint.tags.length === 0 ? {} : { tags: [...endpoint.tags] }),
    description: `Scenarios: ${['notFound', 'unauthorized', 'forbidden', 'rateLimited', 'serverError', 'unavailable', 'slow', ...Object.keys(endpoint.scenarios)].map((n) => `\`${n}\``).join(', ')}.`,
    ...body,
    ...(params.length > 0 ? { parameters: params } : {}),
    ...(endpoint.auth === 'bearer' ? { security: [{ bearerAuth: [] }] } : {}),
  };
}

/** The OpenAPI 3.1 document of a definition: every endpoint, with schemas built from its collections. */
export function buildOpenApi(definition: Backend): JsonObject {
  const collections = new Map(definition.collections.map((collection) => [collection.name, collection]));
  const schemas: JsonObject = { Problem: PROBLEM };
  for (const collection of definition.collections) {
    const name = pascal(collection.name);
    const { output, input } = collectionSchemas(collection);
    schemas[name] = output;
    schemas[`${name}Input`] = input;
  }
  const paths: JsonObject = {};
  const tags = new Set<string>();
  for (const endpoint of definition.endpoints) {
    for (const path of [endpoint.path, ...(endpoint.aliases ?? [])]) {
      const key = openApiPath(path);
      const item = (paths[key] ?? {}) as JsonObject;
      const op = operation(endpoint, collections);
      // An alias is the same operation; its id gets a suffix so ids stay unique.
      item[endpoint.method.toLowerCase()] = path === endpoint.path ? op : { ...op, operationId: `${String(op.operationId)}_alias` };
      paths[key] = item;
    }
    for (const tag of endpoint.tags ?? []) tags.add(tag);
  }
  const document: JsonObject = {
    openapi: '3.1.0',
    info: {
      title: definition.name,
      version: '1.0.0',
      description: 'Generated from backend.json by Tempo Local Backend. A local development server: do not use its data or credentials anywhere else.',
    },
    servers: [{ url: definition.basePath ?? '/' }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: { schemas, securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
  };
  return sortKeys(document) as JsonObject;
}
