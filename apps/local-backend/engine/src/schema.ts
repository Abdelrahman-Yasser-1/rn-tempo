import { z } from 'zod';

import { isIdentifier } from './names.ts';
import { checkShape } from './values.ts';

const identifier = z
  .string()
  .refine(isIdentifier, { message: 'Use a name that starts with a lowercase letter and holds only letters, digits and "_" (at most 63 characters).' });

export const FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'enum', 'json', 'relation', 'media'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FieldSchema = z
  .strictObject({
    name: identifier,
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    unique: z.boolean().default(false),
    default: z.unknown().optional().meta({ description: 'Used when a create request leaves the field out.' }),
    enumValues: z.array(z.string()).min(1).optional().meta({ description: 'The allowed values of an `enum` field.' }),
    relationTo: identifier.optional().meta({ description: 'The collection a `relation` field points at (stores its id).' }),
  })
  .superRefine((field, ctx) => {
    if (field.name === 'id') ctx.addIssue({ code: 'custom', path: ['name'], message: '"id" is added to every collection; pick another name.' });
    if (field.default !== undefined && field.default !== null) {
      const problem = checkShape(field as Field, field.default);
      if (problem !== undefined) ctx.addIssue({ code: 'custom', path: ['default'], message: `The default is wrong: ${problem}` });
    }
    if (field.type === 'enum' && field.enumValues === undefined) {
      ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'An enum field needs enumValues.' });
    }
    if (field.type !== 'enum' && field.enumValues !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'enumValues only applies to an enum field.' });
    }
    if (field.type === 'relation' && field.relationTo === undefined) {
      ctx.addIssue({ code: 'custom', path: ['relationTo'], message: 'A relation field needs relationTo.' });
    }
    if (field.type !== 'relation' && field.relationTo !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['relationTo'], message: 'relationTo only applies to a relation field.' });
    }
  })
  .meta({ title: 'Field' });

const SeedSchema = z
  .union([z.string().min(1), z.array(z.record(z.string(), z.unknown()))])
  .meta({ description: 'Rows to insert when the collection is first created: a file name inside `seed/`, or the rows themselves.' });

export const CollectionSchema = z
  .strictObject({
    name: identifier,
    fields: z.array(FieldSchema).default([]),
    seed: SeedSchema.optional(),
  })
  .superRefine((collection, ctx) => {
    const seen = new Set<string>();
    collection.fields.forEach((field, index) => {
      const key = field.name.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['fields', index, 'name'], message: `Duplicate field "${field.name}" (names are not case sensitive).` });
      seen.add(key);
    });
  })
  .meta({ title: 'Collection' });

export const ScenarioSchema = z
  .strictObject({
    status: z.number().int().min(100).max(599).optional(),
    delayMs: z.number().int().min(0).max(60_000).optional().meta({ description: 'Wait this long before answering.' }),
    body: z.unknown().optional().meta({ description: 'Sent as the JSON body instead of the normal response.' }),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .meta({ title: 'Scenario', description: 'A canned response, picked with the x-tempo-scenario header or the admin API.' });

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const CRUD_ACTIONS = ['list', 'get', 'create', 'update', 'delete'] as const;
export type CrudAction = (typeof CRUD_ACTIONS)[number];

const EndpointPath = z
  .string()
  .regex(/^\/[^\s?#]*$/, 'A path starts with "/" and has no spaces, "?" or "#".')
  .refine((path) => !(path.split('/').find((part) => part !== '') ?? '').startsWith('__'), { message: 'Paths starting with "/__" are reserved for the engine.' })
  .refine((path) => !path.includes('//'), { message: 'A path may not contain "//".' })
  .refine((path) => !path.split('/').includes('..'), { message: 'A path may not contain "..".' })
  .meta({ description: 'Express-style path with `:param` segments, for example `/products/:id`.' });

const common = {
  id: z.string().min(1).max(200).meta({ description: 'Stable id, for example `get.products.:id`. Scenarios and stats use it.' }),
  method: z.enum(HTTP_METHODS),
  path: EndpointPath,
  aliases: z.array(EndpointPath).optional().meta({ description: 'Extra paths that serve the same endpoint, for example `/products/add`.' }),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  auth: z.enum(['none', 'bearer']).default('none'),
  scenarios: z.record(z.string(), ScenarioSchema).default({}),
};

const CrudEndpoint = z.strictObject({
  ...common,
  type: z.literal('crud'),
  collection: identifier,
  action: z.enum(CRUD_ACTIONS),
  listShape: z.enum(['dummyjson', 'paged']).default('dummyjson').meta({
    description: '`dummyjson`: `{ <collection>: [...], total, skip, limit }`. `paged`: `{ items, total, page, pageSize }`.',
  }),
  defaultLimit: z.number().int().min(1).max(10_000).default(30),
  searchFields: z.array(identifier).optional().meta({ description: 'String fields the `q` parameter searches. Defaults to every string and enum field.' }),
  hiddenFields: z.array(identifier).default([]).meta({ description: 'Fields left out of every response of this endpoint.' }),
  unknownFields: z.enum(['reject', 'strip']).default('reject').meta({ description: 'What to do with request fields the collection does not define.' }),
  deleteMarkers: z.boolean().default(true).meta({ description: 'Add `isDeleted: true` and `deletedOn` to the deleted record, like dummyjson.' }),
  successStatus: z.number().int().min(200).max(299).optional().meta({ description: 'Defaults to 201 for create and 200 otherwise.' }),
});

const StaticEndpoint = z.strictObject({
  ...common,
  type: z.literal('static'),
  status: z.number().int().min(100).max(599).default(200),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
});

// Y2 implements these; the schema accepts them now and the engine answers 501.
const AuthEndpoint = z.strictObject({
  ...common,
  type: z.literal('auth'),
  action: z.enum(['login', 'refresh', 'me', 'logout', 'register', 'forgotPassword', 'otpVerify', 'otpResend']),
});
const UploadEndpoint = z.strictObject({ ...common, type: z.literal('upload'), maxBytes: z.number().int().positive().optional() });
const DownloadEndpoint = z.strictObject({ ...common, type: z.literal('download') });
const HandlerEndpoint = z.strictObject({
  ...common,
  type: z.literal('handler'),
  file: z.string().min(1).meta({ description: 'A file in `handlers/`.' }),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});

export const EndpointSchema = z.discriminatedUnion('type', [
  CrudEndpoint,
  StaticEndpoint,
  AuthEndpoint,
  UploadEndpoint,
  DownloadEndpoint,
  HandlerEndpoint,
]);

const ContentTypeStub = z.looseObject({ name: identifier }).meta({ description: 'Content types arrive in a later phase; only the name is checked.' });

export const BackendSchema = z
  .strictObject({
    $schema: z.string().optional(),
    name: z.string().min(1).max(100),
    port: z.number().int().min(1).max(65_535).default(8443),
    https: z.boolean().default(true),
    basePath: z
      .string()
      .regex(/^(\/[A-Za-z0-9._~-]+)*$/, 'A base path looks like "/api/v1".')
      .refine((path) => !path.startsWith('/__'), { message: 'Paths starting with "/__" are reserved for the engine.' })
      .optional()
      .meta({ description: 'Mounted in front of every endpoint path.' }),
    certsDir: z.string().optional().meta({ description: 'Folder with cert.pem and key.pem. Defaults to `.data/certs`.' }),
    auth: z
      .strictObject({
        accessTokenSeconds: z.number().int().positive().default(3600),
        refreshTokenSeconds: z.number().int().positive().default(2_592_000),
      })
      .default({ accessTokenSeconds: 3600, refreshTokenSeconds: 2_592_000 }),
    media: z.strictObject({ maxBytes: z.number().int().positive().default(104_857_600) }).default({ maxBytes: 104_857_600 }),
    collections: z.array(CollectionSchema).default([]),
    endpoints: z.array(EndpointSchema).default([]),
    contentTypes: z.array(ContentTypeStub).default([]),
  })
  .superRefine((def, ctx) => {
    const collections = new Map<string, (typeof def.collections)[number]>();
    def.collections.forEach((collection, index) => {
      const key = collection.name.toLowerCase();
      if (collections.has(key)) ctx.addIssue({ code: 'custom', path: ['collections', index, 'name'], message: `Duplicate collection "${collection.name}" (names are not case sensitive).` });
      collections.set(key, collection);
    });
    const exact = new Map(def.collections.map((collection) => [collection.name, collection]));
    def.collections.forEach((collection, ci) => {
      collection.fields.forEach((field, fi) => {
        if (field.relationTo !== undefined && !exact.has(field.relationTo)) {
          ctx.addIssue({ code: 'custom', path: ['collections', ci, 'fields', fi, 'relationTo'], message: `Unknown collection "${field.relationTo}".` });
        }
      });
    });
    const ids = new Set<string>();
    const routes = new Set<string>();
    def.endpoints.forEach((endpoint, index) => {
      const at = (key: string): (string | number)[] => ['endpoints', index, key];
      if (ids.has(endpoint.id)) ctx.addIssue({ code: 'custom', path: at('id'), message: `Duplicate endpoint id "${endpoint.id}".` });
      ids.add(endpoint.id);
      for (const path of [endpoint.path, ...(endpoint.aliases ?? [])]) {
        const key = `${endpoint.method} ${path.replace(/:[A-Za-z0-9_]+/g, ':')}`;
        if (routes.has(key)) ctx.addIssue({ code: 'custom', path: at('path'), message: `Another endpoint already answers ${endpoint.method} ${path}.` });
        routes.add(key);
      }
      if (endpoint.type !== 'crud') return;
      const collection = exact.get(endpoint.collection);
      if (collection === undefined) {
        ctx.addIssue({ code: 'custom', path: at('collection'), message: `Unknown collection "${endpoint.collection}".` });
        return;
      }
      const names = new Set(collection.fields.map((field) => field.name));
      for (const key of ['searchFields', 'hiddenFields'] as const) {
        (endpoint[key] ?? []).forEach((name, ni) => {
          if (!names.has(name)) ctx.addIssue({ code: 'custom', path: [...at(key), ni], message: `Collection "${collection.name}" has no field "${name}".` });
        });
      }
      const allowed: Record<(typeof CRUD_ACTIONS)[number], readonly HttpMethod[]> = {
        list: ['GET'],
        get: ['GET'],
        create: ['POST'],
        update: ['PUT', 'PATCH'],
        delete: ['DELETE'],
      };
      if (!allowed[endpoint.action].includes(endpoint.method)) {
        ctx.addIssue({ code: 'custom', path: at('method'), message: `A crud "${endpoint.action}" endpoint uses ${allowed[endpoint.action].join(' or ')}.` });
      }
      const needsId = endpoint.action === 'get' || endpoint.action === 'update' || endpoint.action === 'delete';
      for (const path of [endpoint.path, ...(endpoint.aliases ?? [])]) {
        const hasId = path.split('/').includes(':id');
        if (needsId !== hasId) ctx.addIssue({ code: 'custom', path: at('path'), message: needsId ? 'This action needs an ":id" segment in the path.' : 'This action takes no ":id" segment.' });
      }
    });
  })
  .meta({ title: 'backend.json', description: 'A Tempo Local Backend definition.' });

export type Backend = z.infer<typeof BackendSchema>;
export type BackendInput = z.input<typeof BackendSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type CrudEndpoint = Extract<Endpoint, { type: 'crud' }>;
export type StaticEndpoint = Extract<Endpoint, { type: 'static' }>;
export type Scenario = z.infer<typeof ScenarioSchema>;

export interface Issue {
  path: string;
  message: string;
}

/** `endpoints[0].path` style paths for Zod issues. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) out += typeof key === 'number' ? `[${key}]` : out === '' ? String(key) : `.${String(key)}`;
  return out === '' ? '(root)' : out;
}

export function issuesFromZod(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({ path: formatIssuePath(issue.path), message: issue.message }));
}

export class DefinitionError extends Error {
  readonly issues: Issue[];
  constructor(message: string, issues: Issue[] = []) {
    super(issues.length === 0 ? message : `${message}\n${issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n')}`);
    this.name = 'DefinitionError';
    this.issues = issues;
  }
}

/** Parses a definition. Every problem is named by its path. */
export function parseBackend(input: unknown, label = 'backend.json'): Backend {
  const result = BackendSchema.safeParse(input);
  if (!result.success) throw new DefinitionError(`${label} is not valid:`, issuesFromZod(result.error));
  return result.data;
}

/** The JSON Schema of `backend.json`, as written to `schemas/backend.schema.json`. */
export function backendJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(BackendSchema, { io: 'input', unrepresentable: 'any' });
}
