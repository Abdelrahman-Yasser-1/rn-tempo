// The shapes the Rust side and the engine's admin API return. Rust serializes with camelCase.

export type RunState = 'stopped' | 'starting' | 'running' | 'error';

export interface BackendStatus {
  path: string;
  name: string;
  state: RunState;
  scheme: 'http' | 'https' | null;
  port: number | null;
  notice: string | null;
  /** The engine's last words when it stopped on its own. */
  error: string | null;
  logTail: string[];
}

export type Preset = 'tempo-template' | 'empty';

export interface FolderPick {
  path: string;
  empty: boolean;
  hasBackend: boolean;
}

export interface CertInfo {
  hasCert: boolean;
  hasCa: boolean;
  lan: string | null;
}

/** One of the fixed engine commands the app may run. */
export type CliAction =
  | { kind: 'certs' }
  | { kind: 'trustMac' }
  | { kind: 'trustIos'; device: string }
  | { kind: 'pushAndroid'; serial: string | null };

export interface CliOutput {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Simulator {
  udid: string;
  name: string;
  runtime: string;
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: [string, string][];
  body?: string | null;
}

export interface HttpReply {
  status: number;
  body: string;
  ms: number;
  contentType: string | null;
}

export interface ImportFile {
  name: string;
  text: string;
}

export interface UploadSummary {
  uploaded: number;
  failed: string[];
}

export type RevealTarget = 'folder' | 'database';
export type DocsTarget = 'swagger' | 'openApi';

export interface UploadProgress {
  name: string;
  sent: number;
  total: number;
  index: number;
  count: number;
}

// ---- the definition (backend.json)

export const FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'enum', 'json', 'relation', 'media'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  enumValues?: string[];
  relationTo?: string;
}

export interface CollectionDef {
  name: string;
  fields: FieldDef[];
  rows?: number;
}

/** A JSON Schema, as plain data. */
export type JsonSchema = Record<string, unknown>;

export interface Scenario {
  status?: number;
  delayMs?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** From an imported API file: what the response is, and the schema of its body. */
  description?: string;
  schema?: JsonSchema;
}

/** What a request must look like (from an imported API file). A request that does not match answers 400. */
export interface RequestSchemas {
  params?: JsonSchema;
  query?: JsonSchema;
  body?: JsonSchema;
  bodyRequired?: boolean;
}

export type HttpMethodName = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type EndpointType = 'crud' | 'static' | 'auth' | 'users' | 'upload' | 'download' | 'handler' | 'sse';

/** One message of an SSE script. */
export interface SseMessageDef {
  event?: string;
  data?: unknown;
  delayMs?: number;
  repeat?: number;
}
export type CrudAction = 'list' | 'get' | 'create' | 'update' | 'delete';

/** A wait before answering: fixed, or a random one inside a range. */
export type LatencyDef = { fixedMs: number } | { minMs: number; maxMs: number };
export type NetworkPresetName = 'instant' | 'wifi' | '4g' | '3g-slow' | 'timeout' | 'custom';
export interface NetworkDef {
  preset: NetworkPresetName;
  downloadKbps?: number;
  uploadKbps?: number;
  timeoutMs?: number;
}

/** A reusable response: use it as a body with `{ "template": "name", "with": { ... } }`. */
export interface ResponseTemplateDef {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ResponsesDef {
  /** The wrapper of every success answer, with `"{{body}}"` where the endpoint's body goes. */
  success?: unknown;
  error?: { format?: 'problem' | 'dummyjson' | 'custom'; template?: unknown };
  headers?: Record<string, string>;
}

interface EndpointBase {
  id: string;
  method: HttpMethodName;
  path: string;
  summary?: string;
  auth?: 'none' | 'bearer';
  latency?: LatencyDef | 'inherit';
  network?: NetworkDef | 'inherit';
  /** `inherit` (default), `none`, or the name of a response template. */
  wrap?: string;
  headers?: Record<string, string>;
  aliases?: string[];
  tags?: string[];
  scenarios?: Record<string, Scenario>;
  /** Fingerprint of the endpoint as an API file import made it. */
  importedFrom?: string;
}

export type EndpointDef = EndpointBase &
  (
    | {
        type: 'crud';
        collection: string;
        action: CrudAction;
        listShape?: 'dummyjson' | 'paged';
        searchFields?: string[];
        hiddenFields?: string[];
        ownerField?: string;
        defaultLimit?: number;
        unknownFields?: 'reject' | 'strip';
        deleteMarkers?: boolean;
        successStatus?: number;
        media?: 'id' | 'url' | 'object';
      }
    | { type: 'static'; status?: number; body?: unknown; request?: RequestSchemas }
    | { type: 'auth'; action: string }
    | { type: 'users'; action: 'add' | 'update' | 'get' }
    | { type: 'upload'; maxBytes?: number; multiple?: boolean }
    | { type: 'download' }
    | { type: 'handler'; file: string; timeoutMs?: number }
    | { type: 'sse'; script?: SseMessageDef[]; on?: string[]; retryMs?: number; heartbeatMs?: number; idleTimeoutMs?: number; maxConnections?: number; maxConnectionsPerIp?: number; bufferSize?: number }
  );

export interface Definition {
  name: string;
  port?: number;
  https?: boolean;
  /** Team server: `key` makes the public API need an access key. */
  publicAccess?: 'open' | 'key';
  auth?: {
    accessTtlMin?: number;
    maxAccessTtlMin?: number;
    refreshTtlDays?: number;
    otpCode?: string;
    otpResendSec?: number;
    seedUsers?: unknown[];
  };
  media?: { maxBytes?: number };
  latency?: { default?: LatencyDef };
  network?: NetworkDef;
  testMode?: boolean;
  responses?: ResponsesDef;
  responseTemplates?: Record<string, ResponseTemplateDef>;
  collections?: CollectionDef[];
  endpoints?: EndpointDef[];
  /** API files imported into this backend, newest last. */
  imports?: ImportRecord[];
  [key: string]: unknown;
}

export interface ImportRecord {
  source: string;
  format: 'openapi-3.0' | 'openapi-3.1' | 'swagger-2.0';
  importedAt: string;
  hash: string;
}

// ---- importing an API file

/** Where an import reads from: the text of a chosen file, or an address the engine downloads. */
export type ImportSource = { kind: 'file'; name: string; text: string } | { kind: 'url'; url: string };

export type ChangeChoice = 'take-new' | 'keep-mine' | 'merge';

export interface ImportDiffEntry {
  id: string;
  method: string;
  path: string;
  tags: string[];
  summary?: string;
  /** Edited after the import that made it. */
  customized?: boolean;
  /** For a changed endpoint: what differs. */
  changes?: string[];
}

export interface ImportDiff {
  added: ImportDiffEntry[];
  removed: ImportDiffEntry[];
  changed: ImportDiffEntry[];
  unchanged: ImportDiffEntry[];
  skipped: { id: string; method: string; path: string; reason: string }[];
}

export interface ImportPreview {
  source: string;
  format: ImportRecord['format'];
  hash: string;
  title: string | null;
  total: number;
  byTag: Record<string, number>;
  warnings: string[];
  firstImport: boolean;
  diff: ImportDiff;
}

export interface ImportChoices {
  add: Record<string, boolean>;
  remove: Record<string, boolean>;
  change: Record<string, ChangeChoice>;
}

export interface ImportApplied {
  ok: boolean;
  applied: { added: string[]; removed: string[]; taken: string[]; kept: string[]; merged: string[] };
  notes: string[];
  warnings: string[];
}

// ---- admin answers

export interface EndpointStat {
  id: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
}

export interface Stats {
  requestsPerMinute: number;
  total: number;
  errors: number;
  errorRate: number;
  endpoints: EndpointStat[];
  collections: Record<string, number>;
}

export interface MediaUsage {
  files: number;
  bytes: number;
  maxBytes: number;
}

export interface MediaItem {
  id: string;
  url: string;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface MediaPage {
  items: MediaItem[];
  total: number;
  skip: number;
  limit: number;
}

export interface DataPage {
  rows: Record<string, unknown>[];
  total: number;
  skip: number;
  limit: number;
}

export interface AppUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  disabled: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export interface UsersPage {
  users: AppUser[];
  total: number;
  skip: number;
  limit: number;
}

export interface Session {
  id: number;
  userId: number;
  username: string;
  family: string;
  createdAt: string;
  expiresAt: string;
}

export interface Scenarios {
  active: Record<string, string>;
  endpoints: { id: string; scenarios: string[] }[];
}

export interface Loss {
  kind: 'collection' | 'field' | 'contentType' | 'contentField' | 'contentLocale';
  /** The collection, or the content type for the `content*` kinds (empty when a whole locale goes). */
  collection: string;
  field?: string;
  /** A locale removed from the backend (`contentLocale`). */
  locale?: string;
  rows: number;
}

export interface BodyView {
  body?: unknown;
  truncated?: true;
}

export interface RequestEntry {
  id: number;
  at: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  scenario?: string;
  /** What the delay and throttle settings did to this request (absent when nothing). */
  network?: { delayMs?: number; delaySource?: string; downloadKbps?: number; uploadKbps?: number; timedOut?: true; testMode?: true };
  req: { headers?: unknown } & BodyView;
  res: BodyView;
}

export interface RequestEvent {
  backend: string;
  entry: RequestEntry;
}

export interface EventsState {
  backend: string;
  connected: boolean;
}

export interface EndpointRef {
  method: string;
  path: string;
}

export interface ContractDifference extends EndpointRef {
  status: string;
  property: string;
  kind: string;
  expected: string;
  actual: string;
  message: string;
}

export interface ContractReport {
  ok: boolean;
  missing: EndpointRef[];
  extra: EndpointRef[];
  methodMismatches: (EndpointRef & { backendMethods: string[] })[];
  differences: ContractDifference[];
  unchecked: (EndpointRef & { status: string; reason: string })[];
  counts: { fileEndpoints: number; backendEndpoints: number; matched: number };
}

// ---- content (CMS)

export const CONTENT_FIELD_TYPES = ['string', 'text', 'richText', 'number', 'boolean', 'date', 'enum', 'media', 'json', 'list'] as const;
export type ContentFieldType = (typeof CONTENT_FIELD_TYPES)[number];

export interface ContentFieldDef {
  name: string;
  type: ContentFieldType;
  label?: string;
  required?: boolean;
  default?: unknown;
  enumValues?: string[];
}

export interface ContentTypeDef {
  name: string;
  label?: string;
  fields: ContentFieldDef[];
  localized?: boolean;
  singleton?: boolean;
  /** How many entries it has (a count the engine adds when listing). */
  entries?: number;
}

export interface ContentConfig {
  mount: string;
  locales: string[];
  defaultLocale: string;
  versionsKept: number;
}

export type EntryStatus = 'draft' | 'published' | 'scheduled';

export interface EntrySummary {
  id: number;
  type: string;
  slug: string | null;
  status: EntryStatus;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  title: string | null;
  /** The locales that have values. */
  locales: string[];
}

export interface EntryPage {
  items: EntrySummary[];
  total: number;
  skip: number;
  limit: number;
}

/** Per locale, the field values of an entry. */
export type EntryValues = Record<string, Record<string, unknown>>;

export interface EntryDetail {
  id: number;
  type: string;
  slug: string | null;
  status: EntryStatus;
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  values: EntryValues;
}

export interface EntryVersion {
  version: number;
  reason: 'create' | 'save' | 'revert';
  savedAt: string;
  slug: string | null;
  locales: string[];
}

/** A client connected to an SSE, WebSocket or GraphQL endpoint (the Live panel). The address is only a short hash. */
export interface LiveClient {
  id: string;
  connectedAt: string;
  ipHash: string;
  user?: string;
  protocol?: string;
  messagesIn: number;
  messagesOut: number;
}

export interface LiveLine {
  at: string;
  direction: 'in' | 'out' | 'event' | 'system';
  clientId?: string;
  event?: string;
  text: string;
}
