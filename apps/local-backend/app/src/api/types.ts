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

export interface NodeInfo {
  ok: boolean;
  path: string | null;
  version: string | null;
  loginPath: string | null;
  message: string | null;
  docsUrl: string;
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
  kind: 'collection' | 'field';
  collection: string;
  field?: string;
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
