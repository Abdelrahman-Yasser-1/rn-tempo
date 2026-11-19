import type { TeamApi } from './team';
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
  Preset,
  RequestEvent,
  RevealTarget,
  Simulator,
  UploadProgress,
  UploadSummary,
} from './types';

/** What the current shell can do. The UI hides or explains what a shell cannot (see `useCapabilities`). */
export interface Capabilities {
  /** `desktop`: the Tauri app on the user's machine. `web`: a browser talking to `local-backend-engine web`. */
  mode: 'desktop' | 'web';
  /** Open a backend's folder or database in the file manager. */
  reveal: boolean;
  /** Add the local CA to this machine, an iOS simulator or an Android emulator. */
  trustLocalDevices: boolean;
  /** Pick any folder on disk for a new or existing backend. Without it, backends live in the server's backends directory. */
  folderPicker: boolean;
  /** Files dropped on the window are uploaded (the desktop shell keeps their paths). */
  dropFiles: boolean;
}

export const DESKTOP_CAPABILITIES: Capabilities = { mode: 'desktop', reveal: true, trustLocalDevices: true, folderPicker: true, dropFiles: true };
export const WEB_CAPABILITIES: Capabilities = { mode: 'web', reveal: false, trustLocalDevices: false, folderPicker: false, dropFiles: false };

/** The sign-in of the web shell. The desktop shell has none (its Rust side holds the admin token). */
export interface WebSession {
  /** Asks the server whether this browser is signed in. */
  check: () => Promise<boolean>;
  /** Exchanges the one-time code printed by the server for a session. */
  login: (code: string) => Promise<void>;
  /**
   * `code`: the local web mode (a one-time code). `password`: the team server (email, password, optional TOTP). Known
   * after `check()`. A fake may leave it out, which means `code`.
   */
  mode?: () => 'code' | 'password';
  /** Team server: email and password, then the TOTP or a recovery code when asked. `totp` says the code is needed. */
  loginPassword?: (input: { email: string; password: string; code?: string }) => Promise<'signedIn' | 'totp'>;
  /** Team server: chooses a password with the one-time link from an invitation. */
  setup?: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Called when the server says the session is gone (it expired or was ended). Returns an unsubscribe function. */
  onExpired: (handler: () => void) => () => void;
}

/**
 * The one typed interface between the dashboard and the engine. Two implementations: `tauri.ts` (Rust commands over
 * IPC) and `web.ts` (`fetch` with a session cookie and a CSRF header, `EventSource` for logs). Tests pass a fake.
 * In the desktop shell the admin token and every path outside a backend folder stay on the Rust side; in the web
 * shell the token never reaches the browser at all.
 *
 * In every method `path` names a backend: its folder on the desktop, its name inside the server's backends
 * directory on the web.
 */
export interface Backend {
  capabilities: Capabilities;
  /** `null` in the desktop shell. */
  session: WebSession | null;
  /** The team server's accounts, keys and audit routes. `null` everywhere else (desktop, local web). */
  team: TeamApi | null;
  /** Web only: folders in the server's backends directory that are not in the list yet (they can be opened). */
  listUnlisted: () => Promise<string[]>;
  /** Web only: puts a folder of the backends directory back in the list. */
  openNamed: (name: string) => Promise<BackendStatus>;
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

/** The name the rest of the UI uses for the interface. */
export type Api = Backend;

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
