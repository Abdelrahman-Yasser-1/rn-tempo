import { z } from 'zod';

import { MAX_DELAY_MS, MAX_TIMEOUT_MS } from './constants.ts';
import { isIdentifier } from './names.ts';
import { checkContentShape, isSlug, SLUG_HELP } from './content-values.ts';
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

const delayMs = z.number().int().min(0).max(MAX_DELAY_MS);

const FixedLatency = z.strictObject({ fixedMs: delayMs.meta({ description: 'Wait exactly this long before answering.' }) });
const RangeLatency = z
  .strictObject({
    minMs: delayMs.meta({ description: 'The shortest wait.' }),
    maxMs: delayMs.meta({ description: 'The longest wait. A random value from `minMs` to `maxMs` is picked for each request.' }),
  })
  .refine((range) => range.minMs <= range.maxMs, { message: 'minMs must not be more than maxMs.', path: ['maxMs'] });
/** A wait before answering: a fixed time, or a random one inside a range. */
export const LatencySchema = z.union([FixedLatency, RangeLatency]).meta({ title: 'Latency', description: 'A fixed delay (`{ "fixedMs": 300 }`) or a random one (`{ "minMs": 100, "maxMs": 900 }`).' });
export type Latency = z.infer<typeof LatencySchema>;

export const NETWORK_PRESETS = ['instant', 'wifi', '4g', '3g-slow', 'timeout', 'custom'] as const;
export type NetworkPreset = (typeof NETWORK_PRESETS)[number];
const kbps = z.number().int().min(1).max(10_000_000);
/** How the connection behaves: a named profile (latency and throughput), with optional overrides. */
export const NetworkSchema = z
  .strictObject({
    preset: z.enum(NETWORK_PRESETS).meta({
      description:
        '`instant` (no delay), `wifi` (20 ms, 30 Mbps down), `4g` (60 ms, 9 Mbps down), `3g-slow` (400 ms, 500 kbps), `timeout` (holds the answer, then closes the connection) or `custom` (only the numbers below).',
    }),
    downloadKbps: kbps.optional().meta({ description: 'Response speed in kilobits per second. Replaces the preset\'s own.' }),
    uploadKbps: kbps.optional().meta({ description: 'Request body speed in kilobits per second. Replaces the preset\'s own.' }),
    timeoutMs: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional().meta({ description: 'How long the `timeout` preset holds the request before closing the connection (default 30000).' }),
  })
  .meta({ title: 'Network' });
export type Network = z.infer<typeof NetworkSchema>;

export const ScenarioSchema = z
  .strictObject({
    status: z.number().int().min(100).max(599).optional(),
    delayMs: z.number().int().min(0).max(MAX_DELAY_MS).optional().meta({ description: 'Wait this long before answering. It wins over every other delay setting.' }),
    body: z.unknown().optional().meta({ description: 'Sent as the JSON body instead of the normal response.' }),
    headers: z.record(z.string(), z.string()).optional(),
    description: z.string().max(500).optional().meta({ description: 'What the response is (from an imported API file).' }),
    schema: z.record(z.string(), z.unknown()).optional().meta({ description: 'JSON Schema of this response body (from an imported API file). Documentation only.' }),
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
  latency: z.union([LatencySchema, z.literal('inherit')]).optional().meta({ description: 'A delay for this endpoint, or `"inherit"` (the default) for the backend\'s `latency.default`.' }),
  network: z.union([NetworkSchema, z.literal('inherit')]).optional().meta({ description: 'A network profile for this endpoint, or `"inherit"` (the default) for the backend\'s `network`.' }),
  scenarios: z.record(z.string(), ScenarioSchema).default({}),
  importedFrom: z.string().max(100).optional().meta({ description: 'Fingerprint of the endpoint as an API file import made it. A different fingerprint now means someone edited it.' }),
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
  ownerField: identifier.optional().meta({
    description:
      'A number or relation field that holds the id of the signed-in app user. Needs `auth: "bearer"`. Lists show only the caller\'s rows, other rows answer 404, and a create sets the field to the caller.',
  }),
  media: z.enum(['id', 'url', 'object']).default('id').meta({
    description: 'How `media` fields appear in responses: the stored id, a download URL, or `{ id, url, name, mime, size }`.',
  }),
});

const JsonSchemaValue = z.record(z.string(), z.unknown());
export const RequestSchemas = z
  .strictObject({
    params: JsonSchemaValue.optional().meta({ description: 'JSON Schema of the path parameters.' }),
    query: JsonSchemaValue.optional().meta({ description: 'JSON Schema of the query string.' }),
    body: JsonSchemaValue.optional().meta({ description: 'JSON Schema of the JSON request body.' }),
    bodyRequired: z.boolean().optional().meta({ description: 'A request without a body is refused with 400.' }),
  })
  .meta({ title: 'RequestSchemas', description: 'A request that does not match answers 400 with the names of the wrong fields.' });

const StaticEndpoint = z.strictObject({
  ...common,
  type: z.literal('static'),
  request: RequestSchemas.optional(),
  status: z.number().int().min(100).max(599).default(200),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
});

export const AUTH_ACTIONS = ['login', 'refresh', 'me', 'logout', 'register', 'updateMe', 'forgotPassword', 'otpVerify', 'otpResend'] as const;
const AuthEndpoint = z.strictObject({
  ...common,
  type: z.literal('auth'),
  action: z.enum(AUTH_ACTIONS),
});
export const USER_ACTIONS = ['add', 'update', 'get'] as const;
const UsersEndpoint = z.strictObject({
  ...common,
  type: z.literal('users'),
  action: z.enum(USER_ACTIONS).meta({
    description: 'Maps C13 `POST /users/add`, `PUT /users/:id` and `GET /users/:id` onto the built-in app users. Only safe fields are read or shown; the password hash never is.',
  }),
});
const UploadEndpoint = z.strictObject({
  ...common,
  type: z.literal('upload'),
  maxBytes: z.number().int().positive().optional().meta({ description: 'Per-file limit. Defaults to `media.maxBytes`.' }),
  multiple: z.boolean().default(false).meta({ description: 'Accept several `file` parts in one multipart request (answers `{ files: [...] }`).' }),
});
const DownloadEndpoint = z.strictObject({ ...common, type: z.literal('download') });
export const HANDLER_FILE = /^handlers\/[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*\.(?:js|mjs|cjs)$/;
const HandlerEndpoint = z.strictObject({
  ...common,
  type: z.literal('handler'),
  file: z.string().regex(HANDLER_FILE, 'A handler file looks like "handlers/name.js" (inside the handlers folder, no "..").').meta({
    description:
      'A JavaScript file in `handlers/` that exports `default async function (ctx)`. Handlers are TRUSTED CODE running in a worker thread with a timeout and a memory limit; this is not a security sandbox, so only open backends you trust.',
  }),
  timeoutMs: z.number().int().positive().max(30_000).default(5000).meta({ description: 'The worker is terminated after this long (default 5000, at most 30000); the answer is 504.' }),
});

export const EndpointSchema = z.discriminatedUnion('type', [
  CrudEndpoint,
  StaticEndpoint,
  AuthEndpoint,
  UploadEndpoint,
  DownloadEndpoint,
  HandlerEndpoint,
  UsersEndpoint,
]);

export const CONTENT_FIELD_TYPES = ['string', 'text', 'richText', 'number', 'boolean', 'date', 'enum', 'media', 'json', 'list'] as const;
export type ContentFieldType = (typeof CONTENT_FIELD_TYPES)[number];

/** A language code such as `en`, `ar` or `pt-BR`. */
export const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const locale = z.string().regex(LOCALE_PATTERN, 'A locale looks like "en", "ar" or "pt-BR".');

export const ContentFieldSchema = z
  .strictObject({
    name: identifier,
    type: z.enum(CONTENT_FIELD_TYPES).meta({
      description:
        '`string` (one line), `text` (long text), `richText` (Markdown text: stored as written, never HTML), `number`, `boolean`, `date` (ISO 8601), `enum`, `media` (a media id), `json`, `list` (a list of strings).',
    }),
    label: z.string().max(100).optional().meta({ description: 'The name shown in the app. Defaults to the field name.' }),
    required: z.boolean().default(false).meta({ description: 'Needed to publish (in the default locale). A draft may leave it empty.' }),
    default: z.unknown().optional().meta({ description: 'Put in existing entries when the field is added.' }),
    enumValues: z.array(z.string()).min(1).optional().meta({ description: 'The allowed values of an `enum` field.' }),
  })
  .superRefine((field, ctx) => {
    if (field.default !== undefined && field.default !== null) {
      const problem = checkContentShape(field as ContentField, field.default);
      if (problem !== undefined) ctx.addIssue({ code: 'custom', path: ['default'], message: `The default is wrong: ${problem}` });
    }
    if (field.type === 'enum' && field.enumValues === undefined) ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'An enum field needs enumValues.' });
    if (field.type !== 'enum' && field.enumValues !== undefined) ctx.addIssue({ code: 'custom', path: ['enumValues'], message: 'enumValues only applies to an enum field.' });
  })
  .meta({ title: 'ContentField' });

export const ContentSeedEntrySchema = z
  .strictObject({
    slug: z.string().optional(),
    status: z.enum(['draft', 'published']).default('published'),
    values: z.record(z.string(), z.record(z.string(), z.unknown())).meta({
      description: 'Per locale, the field values: `{ "en": { "title": "Hello" }, "ar": { "title": "..." } }`. A type that is not localized uses the default locale.',
    }),
  })
  .meta({ title: 'ContentSeedEntry' });

export const ContentTypeSchema = z
  .strictObject({
    name: identifier,
    label: z.string().max(100).optional().meta({ description: 'The name shown in the app. Defaults to the type name.' }),
    fields: z.array(ContentFieldSchema).default([]),
    localized: z.boolean().default(false).meta({ description: 'Entries hold one set of values per locale (a missing field falls back to the default locale).' }),
    singleton: z.boolean().optional().meta({ description: 'At most one entry; `GET <mount>/<type>` answers that one object.' }),
    seed: z.array(ContentSeedEntrySchema).optional().meta({ description: 'Entries to create when the type is first added.' }),
  })
  .superRefine((type, ctx) => {
    const seen = new Set<string>();
    type.fields.forEach((field, index) => {
      const key = field.name.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['fields', index, 'name'], message: `Duplicate field "${field.name}" (names are not case sensitive).` });
      seen.add(key);
    });
  })
  .meta({ title: 'ContentType' });

const ContentConfig = z.strictObject({
  mount: z
    .string()
    .regex(/^(\/[A-Za-z0-9._~-]+)+$/, 'A mount looks like "/content".')
    .refine((path) => !path.startsWith('/__'), { message: 'Paths starting with "/__" are reserved for the engine.' })
    .default('/content')
    .meta({ description: 'Where the public content API lives, after `basePath`: `GET <mount>/<type>`.' }),
  locales: z.array(locale).min(1).default(['en', 'ar']).meta({ description: 'The languages of localized content. The default is the template\'s (`template/src/locales`).' }),
  defaultLocale: locale.default('en').meta({ description: 'The language a missing translation falls back to. It must be one of `locales`.' }),
});

const SeedUser = z.strictObject({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256).meta({ description: 'Hashed (scrypt) when the user is seeded; it is never stored as written.' }),
  email: z.string().max(254).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.string().optional(),
  image: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

const AuthConfig = z.strictObject({
  accessTtlMin: z.number().int().positive().max(525_600).default(30).meta({ description: 'Access token lifetime in minutes.' }),
  maxAccessTtlMin: z.number().int().positive().max(525_600).default(60).meta({ description: 'The longest access token a client can get, even when it asks for more with `expiresInMins`.' }),
  refreshTtlDays: z.number().int().positive().max(3650).default(30).meta({ description: 'Refresh token lifetime in days.' }),
  otpCode: z.string().min(1).max(32).default('123456').meta({ description: 'The one-time code `otpVerify` accepts.' }),
  otpResendSec: z.number().int().min(0).max(86_400).default(60).meta({ description: 'The `retryAfterSec` that `otpResend` answers.' }),
  seedUsers: z.array(SeedUser).default([]).meta({ description: 'App users created at start-up when their username does not exist yet (and was never seeded before).' }),
});

const pathSegments = (path: string): string[] => path.split('/').filter((part) => part !== '');

/** Locales, type names, seeds, and no endpoint under the content mount. */
function checkContent(def: { content: z.infer<typeof ContentConfig>; contentTypes: ContentType[]; endpoints: Endpoint[] }, ctx: z.RefinementCtx): void {
  const { locales, defaultLocale, mount } = def.content;
  const seenLocales = new Set<string>();
  locales.forEach((code, index) => {
    if (seenLocales.has(code)) ctx.addIssue({ code: 'custom', path: ['content', 'locales', index], message: `Duplicate locale "${code}".` });
    seenLocales.add(code);
  });
  if (!locales.includes(defaultLocale)) ctx.addIssue({ code: 'custom', path: ['content', 'defaultLocale'], message: `The default locale "${defaultLocale}" must be one of the locales.` });
  const names = new Set<string>();
  def.contentTypes.forEach((type, ti) => {
    const key = type.name.toLowerCase();
    if (names.has(key)) ctx.addIssue({ code: 'custom', path: ['contentTypes', ti, 'name'], message: `Duplicate content type "${type.name}" (names are not case sensitive).` });
    names.add(key);
    if (type.singleton === true && (type.seed?.length ?? 0) > 1) ctx.addIssue({ code: 'custom', path: ['contentTypes', ti, 'seed'], message: 'A singleton holds one entry: seed at most one.' });
    const slugs = new Set<string>();
    (type.seed ?? []).forEach((entry, ei) => {
      const at = (...rest: (string | number)[]): (string | number)[] => ['contentTypes', ti, 'seed', ei, ...rest];
      if (entry.slug !== undefined) {
        if (!isSlug(entry.slug)) ctx.addIssue({ code: 'custom', path: at('slug'), message: SLUG_HELP });
        if (slugs.has(entry.slug)) ctx.addIssue({ code: 'custom', path: at('slug'), message: `Duplicate slug "${entry.slug}".` });
        slugs.add(entry.slug);
      }
    });
  });
  if (def.contentTypes.length === 0) return;
  const mountParts = pathSegments(mount);
  def.endpoints.forEach((endpoint, index) => {
    for (const path of [endpoint.path, ...(endpoint.aliases ?? [])]) {
      const parts = pathSegments(path);
      if (mountParts.every((part, i) => parts[i] === part)) {
        ctx.addIssue({ code: 'custom', path: ['endpoints', index, 'path'], message: `${path} is inside the content mount "${mount}". Move the endpoint, or change content.mount.` });
      }
    }
  });
}

export const ImportRecordSchema = z
  .strictObject({
    source: z.string().max(2000).meta({ description: 'The file name or URL the API file came from.' }),
    format: z.enum(['openapi-3.0', 'openapi-3.1', 'swagger-2.0']),
    importedAt: z.string(),
    hash: z.string().max(100).meta({ description: 'SHA-256 of the file text.' }),
  })
  .meta({ title: 'ImportRecord' });

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
    publicAccess: z
      .enum(['open', 'key'])
      .default('open')
      .meta({ description: '`open`: the public API answers anyone. `key`: every public request needs an `x-tempo-access-key` header with a key of scope `public` (team server only).' }),
    certsDir: z.string().optional().meta({ description: 'Folder with cert.pem and key.pem. Defaults to `.data/certs`.' }),
    latency: z
      .strictObject({ default: LatencySchema.optional().meta({ description: 'The delay of every endpoint that does not set its own.' }) })
      .optional()
      .meta({ description: 'Delays. A scenario\'s `delayMs` wins over an endpoint\'s `latency`, which wins over this.' }),
    network: NetworkSchema.optional().meta({ description: 'The connection profile of every endpoint that does not set its own.' }),
    testMode: z.boolean().default(false).meta({ description: 'Zero every delay, throttle and timeout (and fix `{{now}}` and the random values). A request can opt back in with `x-tempo-test-delays: 1`.' }),
    auth: AuthConfig.default(() => AuthConfig.parse({})),
    media: z.strictObject({ maxBytes: z.number().int().positive().default(104_857_600) }).default({ maxBytes: 104_857_600 }),
    collections: z.array(CollectionSchema).default([]),
    endpoints: z.array(EndpointSchema).default([]),
    content: ContentConfig.default(() => ContentConfig.parse({})),
    contentTypes: z.array(ContentTypeSchema).default([]),
    imports: z.array(ImportRecordSchema).default([]).meta({ description: 'API files imported into this backend, newest last.' }),
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
    checkContent(def, ctx);
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
      if (endpoint.type === 'users') {
        const needsUserId = endpoint.action !== 'add';
        if (needsUserId && endpoint.auth !== 'bearer') {
          ctx.addIssue({ code: 'custom', path: at('auth'), message: `A users "${endpoint.action}" endpoint needs auth: "bearer": it reads or edits a profile, so the caller must be signed in as that user.` });
        }
        const methods: Record<(typeof USER_ACTIONS)[number], HttpMethod[]> = { add: ['POST'], update: ['PUT', 'PATCH'], get: ['GET'] };
        if (!methods[endpoint.action].includes(endpoint.method)) ctx.addIssue({ code: 'custom', path: at('method'), message: `A users "${endpoint.action}" endpoint uses ${methods[endpoint.action].join(' or ')}.` });
        for (const path of [endpoint.path, ...(endpoint.aliases ?? [])]) {
          if (needsUserId !== path.split('/').includes(':id')) ctx.addIssue({ code: 'custom', path: at('path'), message: needsUserId ? 'This action needs an ":id" segment in the path.' : 'This action takes no ":id" segment.' });
        }
      }
      if (endpoint.type === 'download' && ![endpoint.path, ...(endpoint.aliases ?? [])].every((path) => path.split('/').includes(':id'))) {
        ctx.addIssue({ code: 'custom', path: at('path'), message: 'A download endpoint needs an ":id" segment, for example "/media/:id".' });
      }
      if (endpoint.type === 'upload' && endpoint.method !== 'POST') ctx.addIssue({ code: 'custom', path: at('method'), message: 'An upload endpoint uses POST.' });
      if (endpoint.type === 'download' && endpoint.method !== 'GET') ctx.addIssue({ code: 'custom', path: at('method'), message: 'A download endpoint uses GET.' });
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
      if (endpoint.ownerField !== undefined) {
        const owner = collection.fields.find((field) => field.name === endpoint.ownerField);
        if (owner === undefined) ctx.addIssue({ code: 'custom', path: at('ownerField'), message: `Collection "${collection.name}" has no field "${endpoint.ownerField}".` });
        else if (owner.type !== 'number' && owner.type !== 'relation') ctx.addIssue({ code: 'custom', path: at('ownerField'), message: 'The owner field holds a user id: use a number field.' });
        if (endpoint.auth !== 'bearer') ctx.addIssue({ code: 'custom', path: at('ownerField'), message: 'ownerField needs auth: "bearer", so the endpoint knows who is asking.' });
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

export type ContentField = z.infer<typeof ContentFieldSchema>;
export type ContentType = z.infer<typeof ContentTypeSchema>;
export type ContentConfigValue = z.infer<typeof ContentConfig>;
export type Backend = z.infer<typeof BackendSchema>;
export type BackendInput = z.input<typeof BackendSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type UsersEndpoint = Extract<Endpoint, { type: 'users' }>;
export type AuthEndpoint = Extract<Endpoint, { type: 'auth' }>;
export type UploadEndpoint = Extract<Endpoint, { type: 'upload' }>;
export type HandlerEndpoint = Extract<Endpoint, { type: 'handler' }>;
export type CrudEndpoint = Extract<Endpoint, { type: 'crud' }>;
export type AuthConfigValue = z.infer<typeof AuthConfig>;
export type ImportRecord = z.infer<typeof ImportRecordSchema>;
export type RequestSchemasValue = z.infer<typeof RequestSchemas>;
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
