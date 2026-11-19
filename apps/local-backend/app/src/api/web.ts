import { WEB_CAPABILITIES, problemMessage, type Backend, type WebSession } from './client';
import type { BackendStatus, CertInfo, CliOutput, EventsState, HttpReply, HttpRequest, ImportFile, RequestEntry, RequestEvent, UploadProgress, UploadSummary } from './types';

/** Header the server requires on every mutating request made with the session cookie. */
export const CSRF_HEADER = 'x-csrf-token';
const ADMIN = '/__admin/b';
const HUB = '/__hub';
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

/** What the browser provides. Tests pass fakes, so the transport itself needs no DOM. */
export interface WebDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  EventSource: new (url: string) => EventSource;
  /** Opens the file chooser and resolves with the chosen files (none when cancelled). */
  chooseFiles: (accept: string, multiple: boolean) => Promise<File[]>;
  /** Hands a file to the browser as a download. */
  saveFile: (name: string, data: Blob) => void;
  /** Sends one file as the request body and reports progress. */
  uploadFile: (url: string, file: File, headers: Record<string, string>, onProgress: (sent: number, total: number) => void) => Promise<{ status: number; body: string }>;
  /** Opens an address in a new tab. */
  openTab: (url: string) => void;
  now: () => number;
  /** The origin of the page (`location.origin`). */
  origin: () => string;
}

const enc = encodeURIComponent;

/**
 * A route inside one backend's admin API, as the tabs write it (`/data/products?limit=5`). It is appended to
 * `/__admin/b/<backend>`, so anything that could climb out of that (a `..` segment, an encoded dot, slash or
 * backslash, `#`, a doubled slash, a missing leading slash) is refused before a request with the CSRF header is sent.
 */
export function checkAdminRoute(route: string): void {
  const [pathPart = ''] = route.split('?', 1);
  const lower = route.toLowerCase();
  const bad =
    !route.startsWith('/') ||
    route.startsWith('//') ||
    route.includes('\\') ||
    route.includes('#') ||
    [...route].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f) ||
    pathPart.includes('//') ||
    pathPart.split('/').some((segment) => segment === '..' || segment === '.') ||
    /%2e|%2f|%5c|%00/.test(lower);
  if (bad) throw new Error('That is not a valid admin route.');
}

/** `/__admin/b/<backend><route>`, checked to stay on this origin and inside that backend's admin prefix. */
export function adminUrl(path: string, route: string, origin: string): string {
  checkAdminRoute(route);
  const prefix = `${ADMIN}/${enc(path)}/`;
  const url = `${ADMIN}/${enc(path)}${route}`;
  const parsed = new URL(url, origin);
  if (parsed.origin !== new URL(origin).origin || !parsed.pathname.startsWith(prefix)) throw new Error('That is not a valid admin route.');
  return url;
}

/** A folder name for a backend: lower case letters, digits, dash and underscore. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 48);
  return slug === '' ? 'backend' : slug;
}

/**
 * The browser transport: `fetch` to the engine's admin port with the session cookie and a CSRF header,
 * `EventSource` for the request log, file inputs for uploads and imports, downloads for exports. The admin token
 * is never here; the server keeps it.
 */
export function createWebTransport(deps: WebDeps): Backend {
  let csrf: string | null = null;
  const expiredHandlers = new Set<() => void>();
  const requestHandlers = new Set<(event: RequestEvent) => void>();
  const stateHandlers = new Set<(event: EventsState) => void>();
  const uploadHandlers = new Set<(event: UploadProgress) => void>();
  const streams = new Map<string, EventSource>();

  const expired = (): void => {
    csrf = null;
    for (const handler of expiredHandlers) handler();
  };

  async function call(method: string, url: string, options: { body?: BodyInit; headers?: Record<string, string> } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (!['GET', 'HEAD'].includes(method) && csrf !== null) headers[CSRF_HEADER] = csrf;
    const response = await deps.fetch(url, { method, headers, credentials: 'same-origin', ...(options.body === undefined ? {} : { body: options.body }) });
    if (response.status === 401) expired();
    return response;
  }

  async function hub<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await call(method, `${HUB}${path}`, body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
    const text = await response.text();
    if (!response.ok) throw new Error(problemMessage(response.status, text));
    return (text === '' ? undefined : JSON.parse(text)) as T;
  }

  async function adminCall(path: string, request: HttpRequest): Promise<HttpReply> {
    const started = deps.now();
    const headers: Record<string, string> = Object.fromEntries(request.headers ?? []);
    const hasBody = request.body !== undefined && request.body !== null;
    if (hasBody && !Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
    const response = await call(request.method, adminUrl(path, request.path, deps.origin()), { headers, ...(hasBody ? { body: request.body as string } : {}) });
    const body = await response.text();
    return { status: response.status, body, ms: Math.max(0, deps.now() - started), contentType: response.headers.get('content-type') };
  }

  async function adminBlob(path: string, route: string): Promise<Blob> {
    const response = await call('GET', adminUrl(path, route, deps.origin()));
    if (!response.ok) throw new Error(problemMessage(response.status, await response.text()));
    return response.blob();
  }

  const unsupported = (what: string) => (): Promise<never> => Promise.reject(new Error(`${what} is only available in the desktop app.`));

  function closeStream(path: string): void {
    streams.get(path)?.close();
    streams.delete(path);
  }

  const session: WebSession = {
    async check() {
      const response = await deps.fetch('/__session', { credentials: 'same-origin' });
      if (!response.ok) return false;
      const body = (await response.json()) as { authenticated?: boolean; csrf?: string };
      csrf = body.authenticated === true && typeof body.csrf === 'string' ? body.csrf : null;
      return csrf !== null;
    },
    async login(code) {
      const response = await deps.fetch('/__session', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      const text = await response.text();
      if (!response.ok) throw new Error(problemMessage(response.status, text));
      const body = JSON.parse(text) as { csrf?: string };
      if (typeof body.csrf !== 'string') throw new Error('The server did not start a session.');
      csrf = body.csrf;
    },
    async logout() {
      for (const path of [...streams.keys()]) closeStream(path);
      await deps.fetch('/__session', { method: 'DELETE', credentials: 'same-origin', headers: csrf === null ? {} : { [CSRF_HEADER]: csrf } });
      csrf = null;
    },
    onExpired(handler) {
      expiredHandlers.add(handler);
      return () => void expiredHandlers.delete(handler);
    },
  };

  const subscribe =
    <T>(set: Set<(event: T) => void>) =>
    (handler: (event: T) => void): Promise<() => void> => {
      set.add(handler);
      return Promise.resolve(() => void set.delete(handler));
    };

  return {
    capabilities: WEB_CAPABILITIES,
    session,
    listUnlisted: () => hub<string[]>('GET', '/unlisted'),
    openNamed: (name) => hub<BackendStatus>('POST', '/backends/open', { name }),
    listBackends: () => hub<BackendStatus[]>('GET', '/backends'),
    backendStatus: async (path) => {
      const found = (await hub<BackendStatus[]>('GET', '/backends')).find((backend) => backend.path === path);
      if (found === undefined) throw new Error('That backend is not in the list.');
      return found;
    },
    pickNewFolder: unsupported('Choosing a folder'),
    createBackend: (path, name, preset, port) => hub<BackendStatus>('POST', '/backends', { id: path, name, preset, port }),
    openBackend: unsupported('Choosing a folder'),
    removeBackend: async (path) => {
      closeStream(path);
      await hub<unknown>('DELETE', `/backends/${enc(path)}`);
    },
    startBackend: (path, port) => hub<BackendStatus>('POST', `/backends/${enc(path)}/start`, { port }),
    stopBackend: (path) => hub<BackendStatus>('POST', `/backends/${enc(path)}/stop`, {}),
    admin: adminCall,
    tryIt: (path, request) => hub<HttpReply>('POST', `/backends/${enc(path)}/try`, request),
    certInfo: (path) => hub<CertInfo>('GET', `/backends/${enc(path)}/cert-info`),
    engineCli: (path, action): Promise<CliOutput> => {
      if (action.kind !== 'certs') return Promise.reject(new Error('Trusting a certificate changes the trust store of the machine running the server, so it is only available in the desktop app.'));
      return hub<CliOutput>('POST', `/backends/${enc(path)}/certs`, {});
    },
    checkOpenapi: async (path) => {
      const [file] = await deps.chooseFiles('.json,application/json', false);
      if (file === undefined) return null;
      if (file.size > MAX_IMPORT_BYTES) return { code: 1, stdout: '', stderr: 'That file is larger than 8 MB.' };
      const reply = await adminCall(path, { method: 'POST', path: '/contract-check', body: await file.text() });
      if (reply.status >= 400) return { code: 1, stdout: '', stderr: problemMessage(reply.status, reply.body) };
      const ok = (JSON.parse(reply.body) as { ok?: boolean }).ok === true;
      return { code: ok ? 0 : 1, stdout: reply.body, stderr: '' };
    },
    exportSnapshot: async (path) => {
      const name = `${path}-backup.zip`;
      deps.saveFile(name, await adminBlob(path, '/snapshot'));
      return name;
    },
    restoreSnapshot: async () => {
      const [file] = await deps.chooseFiles('.zip,application/zip', false);
      if (file === undefined) return null;
      const response = await call('POST', `${HUB}/restore?name=${enc(slugify(file.name.replace(/\.zip$/i, '')))}`, { body: file, headers: { 'content-type': 'application/zip' } });
      const text = await response.text();
      if (!response.ok) throw new Error(problemMessage(response.status, text));
      return JSON.parse(text) as BackendStatus;
    },
    listSimulators: () => Promise.resolve([]),
    reveal: unsupported('Showing a folder'),
    openDocs: async (path, target) => {
      const found = (await hub<BackendStatus[]>('GET', '/backends')).find((backend) => backend.path === path);
      if (found?.state !== 'running' || found.port === null || found.scheme === null) throw new Error('Start the backend first.');
      deps.openTab(`${found.scheme}://localhost:${String(found.port)}${target === 'swagger' ? '/__docs' : '/__docs/openapi.json'}`);
    },
    createHandler: async (path, name) => (await hub<{ file: string }>('POST', `/backends/${enc(path)}/handlers`, { name })).file,
    engineLog: (path) => hub<string[]>('GET', `/backends/${enc(path)}/engine-log`),
    pickImportFile: async (): Promise<ImportFile | null> => {
      const [file] = await deps.chooseFiles('.json,.csv,application/json,text/csv', false);
      if (file === undefined) return null;
      if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is larger than 8 MB.');
      return { name: file.name, text: await file.text() };
    },
    saveExport: (fileName, extension, text) => {
      const name = `${fileName}.${extension}`;
      deps.saveFile(name, new Blob([text], { type: extension === 'json' ? 'application/json' : 'text/csv' }));
      return Promise.resolve(name);
    },
    uploadMedia: async (path): Promise<UploadSummary | null> => {
      const files = await deps.chooseFiles('', true);
      if (files.length === 0) return null;
      const summary: UploadSummary = { uploaded: 0, failed: [] };
      for (const [index, file] of files.entries()) {
        const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
        if (csrf !== null) headers[CSRF_HEADER] = csrf;
        try {
          const reply = await deps.uploadFile(`${ADMIN}/${enc(path)}/media?name=${enc(file.name)}`, file, headers, (sent, total) => {
            for (const handler of uploadHandlers) handler({ name: file.name, sent, total, index, count: files.length });
          });
          if (reply.status === 401) expired();
          if (reply.status >= 400) summary.failed.push(`${file.name}: ${problemMessage(reply.status, reply.body)}`);
          else summary.uploaded += 1;
        } catch (failure) {
          summary.failed.push(`${file.name}: ${failure instanceof Error ? failure.message : 'the upload failed'}`);
        }
      }
      return summary;
    },
    uploadDropped: unsupported('Dropping files on the window'),
    mediaPreview: async (path, id) => (await adminBlob(path, `/media/${enc(id)}/file`)).arrayBuffer(),
    downloadMedia: async (path, id) => {
      const reply = await adminCall(path, { method: 'GET', path: `/media/${enc(id)}` });
      if (reply.status >= 400) throw new Error(problemMessage(reply.status, reply.body));
      const name = (JSON.parse(reply.body) as { originalName?: string }).originalName ?? id;
      deps.saveFile(name, await adminBlob(path, `/media/${enc(id)}/file`));
      return name;
    },
    subscribeRequests: (path) => {
      closeStream(path);
      const stream = new deps.EventSource(`${ADMIN}/${enc(path)}/events`);
      streams.set(path, stream);
      const state = (connected: boolean): void => {
        for (const handler of stateHandlers) handler({ backend: path, connected });
      };
      stream.addEventListener('open', () => {
        state(true);
      });
      stream.addEventListener('error', () => {
        state(false);
      });
      stream.addEventListener('request', (event) => {
        try {
          const entry = JSON.parse((event as MessageEvent<string>).data) as RequestEntry;
          for (const handler of requestHandlers) handler({ backend: path, entry });
        } catch {
          // A line the dashboard cannot read is skipped; the stream goes on.
        }
      });
      return Promise.resolve();
    },
    unsubscribeRequests: (path) => {
      closeStream(path);
      return Promise.resolve();
    },
    onRequest: subscribe(requestHandlers),
    onEventsState: subscribe(stateHandlers),
    onUpload: subscribe(uploadHandlers),
    onDropped: () => Promise.resolve(() => undefined),
  };
}

/** The real browser pieces for `createWebTransport`. Call it in the browser, not at import time. */
export function browserDeps(): WebDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    EventSource,
    chooseFiles: (accept, multiple) =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.addEventListener('change', () => {
          resolve(Array.from(input.files ?? []));
        });
        input.addEventListener('cancel', () => {
          resolve([]);
        });
        input.click();
      }),
    saveFile: (name, data) => {
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
    },
    uploadFile: (url, file, headers, onProgress) =>
      new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', url);
        for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
        request.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) onProgress(event.loaded, event.total);
        });
        request.addEventListener('load', () => {
          resolve({ status: request.status, body: request.responseText });
        });
        request.addEventListener('error', () => {
          reject(new Error('the upload failed'));
        });
        request.send(file);
      }),
    openTab: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    now: () => Date.now(),
    origin: () => window.location.origin,
  };
}
