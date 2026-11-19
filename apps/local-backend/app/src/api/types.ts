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

export interface Scenario {
  status?: number;
  delayMs?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type HttpMethodName = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type EndpointType = 'crud' | 'static' | 'auth' | 'users' | 'upload' | 'download' | 'handler';
export type CrudAction = 'list' | 'get' | 'create' | 'update' | 'delete';

interface EndpointBase {
  id: string;
  method: HttpMethodName;
  path: string;
  summary?: string;
  auth?: 'none' | 'bearer';
  aliases?: string[];
  tags?: string[];
  scenarios?: Record<string, Scenario>;
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
    | { type: 'static'; status?: number; headers?: Record<string, string>; body?: unknown }
    | { type: 'auth'; action: string }
    | { type: 'users'; action: 'add' | 'update' | 'get' }
    | { type: 'upload'; maxBytes?: number; multiple?: boolean }
    | { type: 'download' }
    | { type: 'handler'; file: string; timeoutMs?: number }
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
  collections?: CollectionDef[];
  endpoints?: EndpointDef[];
  [key: string]: unknown;
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
