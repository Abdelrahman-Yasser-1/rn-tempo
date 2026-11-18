import type {
  BackendStatus,
  CertInfo,
  CliAction,
  CliOutput,
  DocsTarget,
  EventsState,
  FolderPick,
  HttpReply,
  HttpRequest,
  ImportFile,
  Loss,
  NodeInfo,
  Preset,
  RequestEvent,
  RevealTarget,
  Simulator,
  UploadProgress,
  UploadSummary,
} from './types';

/**
 * Everything the UI asks of the app shell. The real implementation (`tauri.ts`) calls Rust commands; tests pass
 * a fake. The admin token and every path outside a backend folder stay on the Rust side.
 */
export interface Api {
  nodeInfo: (refresh: boolean) => Promise<NodeInfo>;
  listBackends: () => Promise<BackendStatus[]>;
  backendStatus: (path: string) => Promise<BackendStatus>;
  /** Step 1 of New backend: a folder dialog. `null` when cancelled. */
  pickNewFolder: () => Promise<FolderPick | null>;
  createBackend: (path: string, name: string, preset: Preset, port: number | null) => Promise<BackendStatus>;
  /** A folder dialog, then the backend is added. `null` when cancelled. */
  openBackend: () => Promise<BackendStatus | null>;
  removeBackend: (path: string) => Promise<void>;
  startBackend: (path: string, port: number | null) => Promise<BackendStatus>;
  stopBackend: (path: string) => Promise<BackendStatus>;
  /** A call to the engine's admin API (`/__admin` is added by Rust, with the token). */
  admin: (path: string, request: HttpRequest) => Promise<HttpReply>;
  /** "Try it": a call to the public API, trusting only this backend's CA. */
  tryIt: (path: string, request: HttpRequest) => Promise<HttpReply>;
  certInfo: (path: string) => Promise<CertInfo>;
  engineCli: (path: string, action: CliAction) => Promise<CliOutput>;
  checkOpenapi: (path: string) => Promise<CliOutput | null>;
  exportSnapshot: (path: string) => Promise<string | null>;
  restoreSnapshot: () => Promise<BackendStatus | null>;
  listSimulators: () => Promise<Simulator[]>;
  reveal: (path: string, target: RevealTarget) => Promise<void>;
  openDocs: (path: string, target: DocsTarget) => Promise<void>;
  createHandler: (path: string, name: string) => Promise<string>;
  engineLog: (path: string) => Promise<string[]>;
  pickImportFile: () => Promise<ImportFile | null>;
  saveExport: (fileName: string, extension: 'json' | 'csv', text: string) => Promise<string | null>;
  uploadMedia: (path: string) => Promise<UploadSummary | null>;
  uploadDropped: (path: string) => Promise<UploadSummary>;
  /** The bytes of an image, video or audio file. Rust refuses every other type. */
  mediaPreview: (path: string, id: string) => Promise<ArrayBuffer>;
  downloadMedia: (path: string, id: string) => Promise<string | null>;
  subscribeRequests: (path: string) => Promise<void>;
  unsubscribeRequests: (path: string) => Promise<void>;
  onRequest: (handler: (event: RequestEvent) => void) => Promise<() => void>;
  onEventsState: (handler: (event: EventsState) => void) => Promise<() => void>;
  onUpload: (handler: (event: UploadProgress) => void) => Promise<() => void>;
  onDropped: (handler: (count: number) => void) => Promise<() => void>;
}

/** An error answer of the engine, with its plain message and what the engine said about a 409. */
export class AdminError extends Error {
  readonly status: number;
  readonly lost: Loss[] | null;
  readonly confirmRequired: boolean;
  constructor(status: number, message: string, lost: Loss[] | null, confirmRequired: boolean) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
    this.lost = lost;
    this.confirmRequired = confirmRequired;
  }
}

interface Problem {
  detail?: unknown;
  title?: unknown;
  message?: unknown;
  errors?: unknown;
  confirmRequired?: unknown;
  lost?: unknown;
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The engine's message in plain words, with the first field problem when it names one. */
export function problemMessage(status: number, text: string): string {
  const body = parseBody(text) as Problem | undefined;
  const base = [body?.detail, body?.message, body?.title].find((value): value is string => typeof value === 'string' && value !== '');
  return base ?? `The engine answered ${String(status)}.`;
}

/** Calls an admin route and returns its JSON. A failure becomes an `AdminError` with the engine's message. */
export async function adminJson<T>(api: Api, path: string, request: HttpRequest): Promise<T> {
  const reply = await api.admin(path, request);
  if (reply.status >= 400) {
    const body = parseBody(reply.body) as Problem | undefined;
    const lost = Array.isArray(body?.lost) ? (body.lost as Loss[]) : null;
    throw new AdminError(reply.status, problemMessage(reply.status, reply.body), lost, body?.confirmRequired === true);
  }
  return (reply.body === '' ? undefined : JSON.parse(reply.body)) as T;
}

export const adminGet = <T>(api: Api, path: string, route: string): Promise<T> => adminJson<T>(api, path, { method: 'GET', path: route });

export const adminSend = <T = unknown>(api: Api, path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown): Promise<T> =>
  adminJson<T>(api, path, { method, path: route, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
