import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import type { Api } from '../api/client';
import { ApiProvider } from '../api/context';
import type { BackendStatus, HttpReply, HttpRequest, NodeInfo } from '../api/types';

export const NODE_OK: NodeInfo = { ok: true, path: '/usr/local/bin/node', version: 'v24.3.0', loginPath: '/usr/bin', message: null, docsUrl: 'https://nodejs.org/en/download' };

export const STOPPED: BackendStatus = { path: '/work/shop', name: 'shop', state: 'stopped', scheme: null, port: null, notice: null, error: null, logTail: [] };
export const RUNNING: BackendStatus = { ...STOPPED, state: 'running', scheme: 'https', port: 8556 };

export const reply = (body: unknown, status = 200): HttpReply => ({ status, body: typeof body === 'string' ? body : JSON.stringify(body), ms: 2, contentType: 'application/json' });

export type RouteHandler = (request: HttpRequest, params: Record<string, string>) => unknown;

/**
 * An `admin` fake: routes are keyed `METHOD /path` (with `:param` segments, the query ignored). A handler returns an
 * `HttpReply` (see `reply`) or any value, which becomes a 200 JSON answer. Unknown routes answer 404.
 */
export function adminRoutes(routes: Record<string, RouteHandler>): Api['admin'] {
  const table = Object.entries(routes).map(([key, handler]) => {
    const [method = '', pattern = ''] = key.split(' ');
    const names: string[] = [];
    const regex = new RegExp(`^${pattern.replace(/:([A-Za-z]+)/g, (_all, name: string) => (names.push(name), '([^/]+)'))}$`);
    return { method, regex, names, handler };
  });
  return vi.fn((_path: string, request: HttpRequest) => {
    const route = request.path.split('?')[0] ?? '';
    for (const entry of table) {
      const found = entry.regex.exec(route);
      if (entry.method !== request.method || found === null) continue;
      const params = Object.fromEntries(entry.names.map((name, index) => [name, decodeURIComponent(found[index + 1] ?? '')]));
      const answer = entry.handler(request, params);
      const isReply = typeof answer === 'object' && answer !== null && 'status' in answer && 'body' in answer && 'ms' in answer;
      return Promise.resolve(isReply ? (answer as HttpReply) : reply(answer));
    }
    return Promise.resolve(reply({ detail: `No route ${request.method} ${route}` }, 404));
  });
}

const unexpected = (name: string) => () => Promise.reject(new Error(`unexpected call to ${name}`));

/** An `Api` where every call fails unless the test provides it. Calls are `vi.fn`, so tests can assert on them. */
export function makeApi(overrides: Partial<Api> = {}): Api {
  const defaults: Api = {
    nodeInfo: vi.fn(() => Promise.resolve(NODE_OK)),
    listBackends: vi.fn(() => Promise.resolve([])),
    backendStatus: vi.fn(unexpected('backendStatus')),
    pickNewFolder: vi.fn(() => Promise.resolve(null)),
    createBackend: vi.fn(unexpected('createBackend')),
    openBackend: vi.fn(() => Promise.resolve(null)),
    removeBackend: vi.fn(() => Promise.resolve()),
    startBackend: vi.fn(() => Promise.resolve(RUNNING)),
    stopBackend: vi.fn(() => Promise.resolve(STOPPED)),
    admin: vi.fn(unexpected('admin')),
    tryIt: vi.fn(unexpected('tryIt')),
    certInfo: vi.fn(() => Promise.resolve({ hasCert: true, hasCa: true, lan: '192.168.1.20' })),
    engineCli: vi.fn(() => Promise.resolve({ code: 0, stdout: 'done', stderr: '' })),
    checkOpenapi: vi.fn(() => Promise.resolve(null)),
    exportSnapshot: vi.fn(() => Promise.resolve(null)),
    restoreSnapshot: vi.fn(() => Promise.resolve(null)),
    listSimulators: vi.fn(() => Promise.resolve([])),
    reveal: vi.fn(() => Promise.resolve()),
    openDocs: vi.fn(() => Promise.resolve()),
    createHandler: vi.fn(unexpected('createHandler')),
    engineLog: vi.fn(() => Promise.resolve([])),
    pickImportFile: vi.fn(() => Promise.resolve(null)),
    saveExport: vi.fn(() => Promise.resolve(null)),
    uploadMedia: vi.fn(() => Promise.resolve(null)),
    uploadDropped: vi.fn(() => Promise.resolve({ uploaded: 0, failed: [] })),
    mediaPreview: vi.fn(unexpected('mediaPreview')),
    downloadMedia: vi.fn(() => Promise.resolve(null)),
    subscribeRequests: vi.fn(() => Promise.resolve()),
    unsubscribeRequests: vi.fn(() => Promise.resolve()),
    onRequest: vi.fn(() => Promise.resolve(() => undefined)),
    onEventsState: vi.fn(() => Promise.resolve(() => undefined)),
    onUpload: vi.fn(() => Promise.resolve(() => undefined)),
    onDropped: vi.fn(() => Promise.resolve(() => undefined)),
  };
  // Every override becomes a spy too, so tests can assert on calls without wrapping each one.
  const wrapped = Object.fromEntries(Object.entries(overrides).map(([name, fn]) => [name, vi.isMockFunction(fn) ? fn : vi.fn(fn as (...args: never[]) => unknown)]));
  return { ...defaults, ...wrapped };
}

export function renderWithApi(ui: ReactElement, api: Api) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>{ui}</ApiProvider>
    </QueryClientProvider>,
  );
}
