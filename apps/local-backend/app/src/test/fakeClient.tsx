import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import type { Client } from '../client/client';
import { ClientProvider } from '../client/context';
import type { CliOutput, NodeInfo, ProjectInfo, ProjectState } from '../client/types';

export const NODE_OK: NodeInfo = {
  ok: true,
  path: '/usr/local/bin/node',
  version: 'v24.3.0',
  loginPath: '/usr/local/bin:/usr/bin',
  message: null,
  docsUrl: 'https://nodejs.org/en/download',
};

export const PROJECT: ProjectInfo = {
  path: '/work/demo',
  name: 'demo',
  kind: 'code',
  appOwned: false,
  tempoApi: { source: 'bundled', version: null },
};

export const STOPPED: ProjectState = { running: false, pid: null, port: null, scheme: null, startedByApp: false };
export const RUNNING: ProjectState = { running: true, pid: 4242, port: 8555, scheme: 'https', startedByApp: true };

export const OK_OUTPUT: CliOutput = { code: 0, stdout: 'done', stderr: '' };

const unexpected = (name: string) => () => Promise.reject(new Error(`unexpected call to ${name}`));

/** A client where every call fails unless the test provides it. Calls are `vi.fn`, so tests can assert on them. */
export function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    nodeInfo: vi.fn(() => Promise.resolve(NODE_OK)),
    listRecents: vi.fn(() => Promise.resolve([])),
    openProject: vi.fn(unexpected('openProject')),
    removeRecent: vi.fn(() => Promise.resolve([])),
    createWorkspace: vi.fn(unexpected('createWorkspace')),
    projectState: vi.fn(() => Promise.resolve(STOPPED)),
    cli: vi.fn(() => Promise.resolve(OK_OUTPUT)),
    control: vi.fn(unexpected('control')),
    subscribeEvents: vi.fn(() => Promise.resolve()),
    unsubscribeEvents: vi.fn(() => Promise.resolve()),
    listBootedSimulators: vi.fn(() => Promise.resolve([])),
    certStatus: vi.fn(() => Promise.resolve({ hasCert: false, hasCa: false })),
    readWorkspace: vi.fn(unexpected('readWorkspace')),
    writeWorkspace: vi.fn(() => Promise.resolve()),
    openTarget: vi.fn(() => Promise.resolve()),
    pickFolder: vi.fn(() => Promise.resolve(null)),
    pickFile: vi.fn(() => Promise.resolve(null)),
    onRequest: vi.fn(() => Promise.resolve(() => undefined)),
    onEventsState: vi.fn(() => Promise.resolve(() => undefined)),
    ...overrides,
  };
}

export function renderWithClient(ui: ReactElement, client: Client) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClientProvider client={client}>{ui}</ClientProvider>
    </QueryClientProvider>,
  );
}

/** A canned reply for `client.control`, keyed by request path. */
export function jsonReply(body: unknown, status = 200) {
  return { status, body: JSON.stringify(body), ms: 3, contentType: 'application/json' };
}
