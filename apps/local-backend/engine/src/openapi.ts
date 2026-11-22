import { openApiPath, sortKeys, type Json } from '@rn-tempo/dev-api';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './content-public.ts';
import { wrapperOf } from './responses.ts';
import type { Backend, Collection, ContentField, CrudEndpoint, Endpoint, Field } from './schema.ts';

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

const str: JsonObject = { type: 'string' };
const USER: JsonObject = {
  type: 'object',
  description: 'Contract C13 `User`. Custom profile fields are added to it.',
  properties: { id: { type: 'integer' }, username: str, email: str, firstName: str, lastName: str, gender: str, image: str },
  required: ['id', 'username', 'email', 'firstName', 'lastName', 'gender', 'image'],
};
const object = (properties: JsonObject, required: string[]): JsonObject => ({ type: 'object', properties, required });
/** Component schemas of the built-in endpoint types; written when an `auth`, `users` or `upload` endpoint exists. */
const BUILTIN_SCHEMAS: Readonly<Record<string, JsonObject>> = {
  User: USER,
  LoginResult: object({ ...(USER.properties as JsonObject), accessToken: str, refreshToken: str }, [...(USER.required as string[]), 'accessToken', 'refreshToken']),
  Tokens: object({ accessToken: str, refreshToken: str }, ['accessToken', 'refreshToken']),
  Success: object({ success: { type: 'boolean' } }, ['success']),
  OtpResendResult: object({ success: { type: 'boolean' }, retryAfterSec: { type: 'integer', minimum: 0 } }, ['success', 'retryAfterSec']),
  MediaFile: object({ id: str, url: str, name: str, mime: str, size: { type: 'integer' } }, ['id', 'url', 'name', 'mime', 'size']),
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
  const present: string[] = ['id'];
  for (const field of collection.fields) {
    const schema = fieldSchema(field);
    inputProps[field.name] = schema;
    if (!hidden.has(field.name)) props[field.name] = field.required ? schema : { oneOf: [schema, { type: 'null' }] };
    // A required field always holds a value, so every response shows it.
    if (!hidden.has(field.name) && field.required) present.push(field.name);
    if (field.required && field.default === undefined) required.push(field.name);
  }
  return {
    output: { type: 'object', properties: props, required: present },
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
          ? { type: 'object', properties: { items: { type: 'array', items: record }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } }, required: ['items', 'total', 'page', 'pageSize'] }
          : { type: 'object', properties: { [collection.name]: { type: 'array', items: record }, total: { type: 'integer' }, skip: { type: 'integer' }, limit: { type: 'integer' } }, required: [collection.name, 'total', 'skip', 'limit'] };
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

/** A schema that describes a JSON example: its types, with every key required. Good enough to compare shapes. */
export function inferSchema(value: unknown): JsonObject {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return value.length === 0 ? { type: 'array' } : { type: 'array', items: inferSchema(value[0]) };
  switch (typeof value) {
    case 'string':
      return str;
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object': {
      const entries = Object.entries(value as Record<string, unknown>);
      const properties: JsonObject = {};
      for (const [key, entry] of entries) properties[key] = inferSchema(entry);
      return { type: 'object', properties, required: entries.map(([key]) => key) };
    }
    default:
      return {};
  }
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: Json): JsonObject => ({ 'application/json': { schema } });
const answer = (status: number, schema: Json): JsonObject => ({ description: STATUS_TEXT[status] ?? 'Response', content: jsonContent(schema) });
const requestOf = (properties: JsonObject, required: string[]): JsonObject => ({ required: true, content: jsonContent({ type: 'object', properties, required }) });

/** The operation of an `auth`, `users`, `upload`, `download` or `handler` endpoint. */
function builtinOperation(endpoint: Exclude<Endpoint, { type: 'crud' | 'static' }>): JsonObject {
  const responses: JsonObject = {};
  let requestBody: JsonObject | undefined;
  switch (endpoint.type) {
    case 'auth':
      switch (endpoint.action) {
        case 'login':
          requestBody = requestOf({ username: str, password: str, expiresInMins: { type: 'integer', exclusiveMinimum: 0 } }, ['username', 'password']);
          responses['200'] = answer(200, ref('LoginResult'));
          responses['400'] = problem('Invalid credentials.');
          break;
        case 'refresh':
          requestBody = requestOf({ refreshToken: str }, ['refreshToken']);
          responses['200'] = answer(200, ref('Tokens'));
          responses['401'] = problem('Invalid refresh token.');
          break;
        case 'me':
          responses['200'] = answer(200, ref('User'));
          break;
        case 'register':
          requestBody = requestOf({ username: str, password: str }, ['username', 'password']);
          responses['201'] = answer(201, ref('User'));
          responses['409'] = problem('The username or email is taken.');
          break;
        case 'updateMe':
          requestBody = requestOf({ firstName: str, lastName: str, email: str }, []);
          responses['200'] = answer(200, ref('User'));
          responses['400'] = problem('The body failed validation.');
          break;
        case 'logout':
          responses['200'] = answer(200, ref('Success'));
          break;
        case 'forgotPassword':
          requestBody = requestOf({ email: str }, ['email']);
          responses['200'] = answer(200, ref('Success'));
          responses['400'] = problem('The body failed validation.');
          break;
        case 'otpVerify':
          requestBody = requestOf({ target: str, code: str, purpose: str }, ['target', 'code']);
          responses['200'] = answer(200, ref('Success'));
          responses['400'] = problem('The body failed validation.');
          break;
        case 'otpResend':
          requestBody = requestOf({ target: str, purpose: str }, ['target']);
          responses['200'] = answer(200, ref('OtpResendResult'));
          responses['400'] = problem('The body failed validation.');
          break;
      }
      break;
    case 'users':
      if (endpoint.action !== 'get') requestBody = requestOf({ username: str, email: str, firstName: str, lastName: str }, []);
      responses[endpoint.action === 'add' ? '201' : '200'] = answer(endpoint.action === 'add' ? 201 : 200, ref('User'));
      responses['400'] = problem('The body failed validation.');
      if (endpoint.action !== 'add') {
        responses['403'] = problem('Only the signed-in user may read or change their own profile.');
        responses['404'] = problem('No user with that id.');
      }
      break;
    case 'upload':
      requestBody = {
        required: true,
        content: { 'multipart/form-data': { schema: object({ file: { type: 'string', format: 'binary' } }, ['file']) } },
      };
      responses['201'] = answer(201, endpoint.multiple ? object({ files: { type: 'array', items: ref('MediaFile') } }, ['files']) : ref('MediaFile'));
      responses['413'] = problem('The file is larger than the limit.');
      break;
    case 'download':
      responses['200'] = { description: 'The file, with its own content type.', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } };
      responses['404'] = problem('No file with that id.');
      break;
    case 'sse':
      responses['200'] = { description: 'A `text/event-stream` that stays open: server-sent events.', content: { 'text/event-stream': { schema: { type: 'string' } } } };
      responses['429'] = problem('Too many connections to this endpoint or from this address.');
      break;
    case 'handler':
      responses['200'] = { description: 'Whatever the handler returns.', content: { 'application/json': {} } };
      responses['500'] = problem('The handler threw.');
      responses['504'] = problem('The handler ran longer than its timeout.');
      break;
  }
  return { ...(requestBody === undefined ? {} : { requestBody }), responses };
}

const BODY_TOKEN = /^\{\{\s*body\s*\}\}$/;
const TOKEN = /^\{\{[^{}]*\}\}$/;

/** The schema of a wrapper (or error) template: its literal parts typed, the whole-string `{{body}}` replaced by `inner`. */
function templateSchema(template: unknown, inner: Json, tokens: Readonly<Record<string, Json>> = {}): Json {
  if (typeof template === 'string') {
    if (BODY_TOKEN.test(template)) return inner;
    if (TOKEN.test(template)) return tokens[template.slice(2, -2).trim()] ?? {};
    return str;
  }
  if (template === null) return { type: 'null' };
  if (typeof template === 'number') return { type: 'number' };
  if (typeof template === 'boolean') return { type: 'boolean' };
  if (Array.isArray(template)) return template.length === 0 ? { type: 'array' } : { type: 'array', items: templateSchema(template[0], inner, tokens) };
  if (typeof template === 'object') {
    const entries = Object.entries(template as Record<string, unknown>);
    return { type: 'object', properties: Object.fromEntries(entries.map(([key, value]) => [key, templateSchema(value, inner, tokens)])), required: entries.map(([key]) => key) };
  }
  return {};
}

/** The wrapper with `{{body}}` replaced by an example, the rest left as written. */
function templateExample(template: unknown, inner: Json): Json {
  if (typeof template === 'string') return BODY_TOKEN.test(template) ? inner : (template as Json);
  if (Array.isArray(template)) return template.map((item) => templateExample(item, inner));
  if (template !== null && typeof template === 'object') return Object.fromEntries(Object.entries(template as Record<string, unknown>).map(([key, value]) => [key, templateExample(value, inner)]));
  return template as Json;
}

/** Puts every 2xx JSON answer inside the success wrapper (the schema and its example). */
function wrapResponses(responses: JsonObject, wrapper: unknown): void {
  if (wrapper === undefined) return;
  for (const [status, response] of Object.entries(responses)) {
    const content = (response as JsonObject).content as JsonObject | undefined;
    const json = content?.['application/json'] as JsonObject | undefined;
    if (!/^2\d\d$/.test(status) || json === undefined) continue;
    const next: JsonObject = { schema: templateSchema(wrapper, (json.schema as Json | undefined) ?? {}) };
    if (json.example !== undefined) next.example = templateExample(wrapper, json.example as Json);
    (response as JsonObject).content = { ...content, 'application/json': next };
  }
}

/** The error answers under the backend's format: the Problem schema is replaced, and non-problem formats are plain JSON. */
function applyErrorFormat(definition: Backend, paths: JsonObject, schemas: JsonObject): void {
  const error = definition.responses?.error;
  if (error === undefined || error.format === 'problem') return;
  if (error.format === 'dummyjson') schemas.Problem = object({ message: str }, ['message']);
  else if (error.template !== undefined) schemas.Problem = { ...(templateSchema(error.template, {}, { status: { type: 'integer' }, message: str, errors: { type: 'array', items: {} } }) as JsonObject), description: 'The backend\'s custom error format.' };
  else return;
  for (const item of Object.values(paths)) {
    for (const op of Object.values(item as JsonObject)) {
      for (const response of Object.values(((op as JsonObject).responses ?? {}) as JsonObject)) {
        const content = (response as JsonObject).content as JsonObject | undefined;
        const problemContent = content?.['application/problem+json'];
        if (content !== undefined && problemContent !== undefined) {
          delete content['application/problem+json'];
          content['application/json'] = problemContent;
        }
      }
    }
  }
}

function operation(endpoint: Endpoint, collections: Map<string, Collection>, definition: Backend): JsonObject {
  let body: JsonObject;
  if (endpoint.type === 'crud') {
    const collection = collections.get(endpoint.collection);
    body = collection === undefined ? { responses: {} } : crudOperation(endpoint, collection, pascal(collection.name));
  } else if (endpoint.type === 'static') {
    const documented = (status: number): Json | undefined => Object.values(endpoint.scenarios).find((scenario) => (scenario.status ?? 200) === status && scenario.schema !== undefined)?.schema as Json | undefined;
    const schema = documented(endpoint.status) ?? (endpoint.body === undefined ? undefined : inferSchema(endpoint.body));
    const responses: JsonObject = {
      [String(endpoint.status)]: {
        description: STATUS_TEXT[endpoint.status] ?? 'Response',
        ...(schema === undefined ? {} : { content: { 'application/json': { schema, ...(endpoint.body === undefined ? {} : { example: endpoint.body as Json }) } } }),
      },
    };
    // A documented response (from an imported file) keeps its own schema and example.
    for (const scenario of Object.values(endpoint.scenarios)) {
      const status = String(scenario.status ?? endpoint.status);
      if (scenario.schema === undefined || responses[status] !== undefined) continue;
      responses[status] = {
        description: scenario.description ?? STATUS_TEXT[Number(status)] ?? 'Response',
        content: { 'application/json': { schema: scenario.schema as Json, ...(scenario.body === undefined ? {} : { example: scenario.body as Json }) } },
      };
    }
    scenarioResponses(endpoint, responses, endpoint.status);
    const parameters: Json[] = [];
    for (const [place, group] of [['path', endpoint.request?.params], ['query', endpoint.request?.query]] as const) {
      const properties = (group?.properties ?? {}) as JsonObject;
      const required = new Set((group?.required ?? []) as string[]);
      for (const [name, propSchema] of Object.entries(properties)) parameters.push({ name, in: place, required: place === 'path' || required.has(name), schema: propSchema });
    }
    body = {
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(endpoint.request?.body === undefined ? {} : { requestBody: { required: endpoint.request.bodyRequired === true, content: { 'application/json': { schema: endpoint.request.body as Json } } } }),
      responses,
    };
  } else {
    body = builtinOperation(endpoint);
  }
  const params: Json[] = [...((body.parameters ?? []) as Json[])];
  for (const [, name] of endpoint.path.matchAll(/:([A-Za-z0-9_]+)/g)) {
    if (name !== undefined && !params.some((p) => (p as JsonObject).name === name && (p as JsonObject).in === 'path')) {
      params.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
  }
  const responses = body.responses as JsonObject;
  if (endpoint.auth === 'bearer') responses['401'] = problem('The access token is missing or wrong.');
  wrapResponses(responses, wrapperOf(definition, endpoint));
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

function contentFieldSchema(field: ContentField): JsonObject {
  switch (field.type) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'enum':
      return { type: 'string', enum: field.enumValues ?? [] };
    case 'date':
      return { type: 'string', description: 'ISO 8601 date or date-time.' };
    case 'media':
      return ref('MediaFile') as JsonObject;
    case 'json':
      return { description: 'Any JSON value.' };
    case 'list':
      return { type: 'array', items: str };
    case 'richText':
      return { type: 'string', description: 'Markdown text. It is never HTML: render it with HTML disabled.' };
    default:
      return { type: 'string' };
  }
}

/** The public content API: per type, `GET <mount>/<type>` and `GET <mount>/<type>/{idOrSlug}`. */
function contentPaths(definition: Backend, schemas: JsonObject, paths: JsonObject, tags: Set<string>): void {
  const { mount, locales, defaultLocale } = definition.content;
  schemas.MediaFile ??= BUILTIN_SCHEMAS.MediaFile as JsonObject;
  const locale: JsonObject = { name: 'locale', in: 'query', required: false, schema: { type: 'string', enum: locales, default: defaultLocale }, description: 'A field this locale leaves empty shows the default locale\'s value (see `fallbackFields`).' };
  const sort: JsonObject = { name: 'sort', in: 'query', required: false, schema: { type: 'string', enum: ['-publishedAt', 'publishedAt', '-updatedAt', 'updatedAt'], default: '-publishedAt' } };
  const listParams: Json[] = [
    locale,
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE } },
    { name: 'skip', in: 'query', required: false, schema: { type: 'integer', minimum: 0 } },
    { name: 'cursor', in: 'query', required: false, schema: { type: 'string' }, description: 'The `nextCursor` of the previous page.' },
    sort,
  ];
  const nullable = (schema: JsonObject): JsonObject => ({ oneOf: [schema, { type: 'null' }] });
  tags.add('content');
  paths[mount] = {
    get: {
      operationId: 'content_types',
      summary: 'The content types, the locales and the default locale',
      tags: ['content'],
      responses: { '200': answer(200, object({ locales: { type: 'array', items: str }, defaultLocale: str, types: { type: 'array', items: { type: 'object' } } }, ['locales', 'defaultLocale', 'types'])) },
    },
  };
  for (const type of definition.contentTypes) {
    const name = `Content${pascal(type.name)}`;
    const fields: JsonObject = {};
    for (const field of type.fields) fields[field.name] = nullable(contentFieldSchema(field));
    schemas[name] = object(
      {
        id: { type: 'integer' },
        type: str,
        slug: nullable(str),
        locale: str,
        availableLocales: { type: 'array', items: str },
        fallbackFields: { type: 'array', items: str },
        publishedAt: nullable(str),
        updatedAt: str,
        fields: object(fields, type.fields.map((field) => field.name)),
      },
      ['id', 'type', 'slug', 'locale', 'availableLocales', 'fallbackFields', 'publishedAt', 'updatedAt', 'fields'],
    );
    const label = type.label ?? type.name;
    const notFound = problem('No published entry.');
    const listAnswer: JsonObject =
      type.singleton === true
        ? { '200': answer(200, ref(name)), '404': notFound }
        : {
            '200': answer(200, object({ items: { type: 'array', items: ref(name) }, total: { type: 'integer' }, limit: { type: 'integer' }, skip: { type: 'integer' }, nextCursor: nullable(str) }, ['items', 'total', 'limit', 'skip', 'nextCursor'])),
            '400': problem('A query parameter is invalid.'),
          };
    paths[`${mount}/${type.name}`] = {
      get: {
        operationId: `content_${type.name}`,
        summary: type.singleton === true ? `The published ${label}` : `Published ${label} entries`,
        description: 'Public and read-only: only published entries. No sign-in needed.',
        tags: ['content'],
        parameters: type.singleton === true ? [locale] : listParams,
        responses: listAnswer,
      },
    };
    paths[`${mount}/${type.name}/{idOrSlug}`] = {
      get: {
        operationId: `content_${type.name}_get`,
        summary: `One published ${label} entry, by id or slug`,
        tags: ['content'],
        parameters: [{ name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string' } }, locale],
        responses: { '200': answer(200, ref(name)), '404': notFound },
      },
    };
  }
}

/** The OpenAPI 3.1 document of a definition: every endpoint, with schemas built from its collections. */
export function buildOpenApi(definition: Backend, options: { prefix?: string } = {}): JsonObject {
  const collections = new Map(definition.collections.map((collection) => [collection.name, collection]));
  const schemas: JsonObject = { Problem: PROBLEM };
  const builtins = new Set<string>();
  for (const endpoint of definition.endpoints) {
    if (endpoint.type === 'auth' || endpoint.type === 'users') ['User', 'LoginResult', 'Tokens', 'Success', 'OtpResendResult'].forEach((name) => builtins.add(name));
    if (endpoint.type === 'upload') builtins.add('MediaFile');
  }
  for (const name of [...builtins].sort()) schemas[name] = BUILTIN_SCHEMAS[name] as JsonObject;
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
      const op = operation(endpoint, collections, definition);
      // An alias is the same operation; its id gets a suffix so ids stay unique.
      item[endpoint.method.toLowerCase()] = path === endpoint.path ? op : { ...op, operationId: `${String(op.operationId)}_alias` };
      paths[key] = item;
    }
    for (const tag of endpoint.tags ?? []) tags.add(tag);
  }
  if (definition.contentTypes.length > 0) contentPaths(definition, schemas, paths, tags);
  applyErrorFormat(definition, paths, schemas);
  const document: JsonObject = {
    openapi: '3.1.0',
    info: {
      title: definition.name,
      version: '1.0.0',
      description: 'Generated from backend.json by Tempo Local Backend. A local development server: do not use its data or credentials anywhere else.',
    },
    servers: [{ url: `${options.prefix ?? ''}${definition.basePath ?? ''}` || '/' }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        ...(definition.publicAccess === 'key' ? { accessKey: { type: 'apiKey', in: 'header', name: 'x-tempo-access-key' } } : {}),
      },
    },
    ...(definition.publicAccess === 'key' ? { security: [{ accessKey: [] }] } : {}),
  };
  return sortKeys(document) as JsonObject;
}
