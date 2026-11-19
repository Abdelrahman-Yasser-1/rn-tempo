import { describe, expect, it, vi } from 'vitest';

import type { Backend } from './client';
import { createTauriTransport, type TauriDeps } from './tauri';
import type { BackendStatus, RequestEntry } from './types';
import { CSRF_HEADER, createWebTransport, type WebDeps } from './web';

const STATUS: BackendStatus = { path: 'shop', name: 'shop', state: 'running', scheme: 'http', port: 8556, notice: null, error: null, logTail: [] };
const ENTRY: RequestEntry = { id: 1, at: '2026-01-01T00:00:00.000Z', method: 'GET', url: '/products', status: 200, ms: 3, req: {}, res: {} };

interface Harness {
  backend: Backend;
  /** Makes the shell deliver one request-log entry for `path`, as the engine's stream would. */
  deliver: (path: string, entry: RequestEntry) => void;
  /** What the shell handed to the user: a saved file name, in the shell's own way. */
  saved: () => string[];
}

// ---- the desktop transport, over a fake IPC
function tauriHarness(): Harness {
  const listeners = new Map<string, ((event: { payload: unknown }) => void)[]>();
  const saved: string[] = [];
  const replies: Record<string, (args: Record<string, unknown>) => unknown> = {
    list_backends: () => [STATUS],
    start_backend: () => STATUS,
    stop_backend: () => ({ ...STATUS, state: 'stopped', scheme: null, port: null }),
    admin: (args) => (((args.request as { path: string }).path === '/definition') ? { status: 200, body: '{"name":"shop"}', ms: 1, contentType: 'application/json' } : { status: 404, body: '{"detail":"Not found."}', ms: 1, contentType: 'application/problem+json' }),
    engine_cli: () => ({ code: 0, stdout: 'done', stderr: '' }),
    save_export: (args) => (saved.push(String(args.fileName)), `/Users/x/${String(args.fileName)}.json`),
    subscribe_requests: () => undefined,
    unsubscribe_requests: () => undefined,
  };
  const backend = createTauriTransport({
    invoke: ((command: string, args: Record<string, unknown> = {}) => Promise.resolve(replies[command]?.(args))) as TauriDeps['invoke'],
    listen: ((event: string, handler: (event: { payload: unknown }) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
      return Promise.resolve(() => void listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== handler)));
    }) as TauriDeps['listen'],
  });
  return {
    backend,
    deliver: (path, entry) => {
      for (const handler of listeners.get('lb://request') ?? []) handler({ payload: { backend: path, entry } });
    },
    saved: () => saved,
  };
}

// ---- the browser transport, over a fake server
class FakeEventSource {
  static all: FakeEventSource[] = [];
  readonly listeners = new Map<string, ((event: Event) => void)[]>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
    queueMicrotask(() => {
      this.emit('open', new Event('open'));
    });
  }
  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  close(): void {
    this.closed = true;
  }
}

interface SeenCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  credentials: string | undefined;
  body: string | undefined;
}

function webHarness(options: { onExpired?: boolean } = {}): Harness & { calls: SeenCall[]; deps: WebDeps; files: File[] } {
  FakeEventSource.all = [];
  const calls: SeenCall[] = [];
  const saved: string[] = [];
  const files: File[] = [];
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const deps: WebDeps = {
    fetch: (url, init) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, headers: (init?.headers ?? {}) as Record<string, string>, credentials: init?.credentials, body: typeof init?.body === 'string' ? init.body : undefined });
      if (options.onExpired === true && url.startsWith('/__hub')) return Promise.resolve(json({ detail: 'Sign in.' }, 401));
      if (url === '/__session' && method === 'GET') return Promise.resolve(json({ authenticated: true, csrf: 'csrf-1' }));
      if (url === '/__session' && method === 'POST') return Promise.resolve(json({ authenticated: true, csrf: 'csrf-1' }));
      if (url === '/__session' && method === 'DELETE') return Promise.resolve(json({ ok: true }));
      if (url === '/__hub/backends' && method === 'GET') return Promise.resolve(json([STATUS]));
      if (url === '/__hub/backends/shop/start') return Promise.resolve(json(STATUS));
      if (url === '/__hub/backends/shop/stop') return Promise.resolve(json({ ...STATUS, state: 'stopped', scheme: null, port: null }));
      if (url === '/__hub/backends/shop/certs') return Promise.resolve(json({ code: 0, stdout: 'done', stderr: '' }));
      if (url === '/__admin/b/shop/definition') return Promise.resolve(json({ name: 'shop' }));
      if (url.startsWith('/__admin/b/shop/media?')) return Promise.resolve(json({ id: 'a' }, 201));
      return Promise.resolve(json({ detail: 'Not found.' }, 404));
    },
    EventSource: FakeEventSource as unknown as WebDeps['EventSource'],
    chooseFiles: () => Promise.resolve(files),
    saveFile: (name) => void saved.push(name),
    uploadFile: (url, file, headers, onProgress) => {
      calls.push({ method: 'POST', url, headers, credentials: undefined, body: file.name });
      onProgress(file.size, file.size);
      return Promise.resolve({ status: 201, body: '{}' });
    },
    openTab: () => undefined,
    now: (() => {
      let tick = 0;
      return () => (tick += 4);
    })(),
  };
  const backend = createWebTransport(deps);
  return {
    backend,
    deps,
    calls,
    files,
    deliver: (path, entry) => {
      const stream = FakeEventSource.all.find((item) => item.url === `/__admin/b/${path}/events` && !item.closed);
      stream?.emit('request', new MessageEvent('request', { data: JSON.stringify(entry) }));
    },
    saved: () => saved,
  };
}

/** The behaviour every transport must give the dashboard, whatever it talks to underneath. */
function backendContract(name: string, make: () => Harness): void {
  describe(`Backend contract: ${name} (AC-LP-1)`, () => {
    it('describes what the shell can do', () => {
      const { capabilities } = make().backend;
      expect(['desktop', 'web']).toContain(capabilities.mode);
      for (const flag of [capabilities.reveal, capabilities.trustLocalDevices, capabilities.folderPicker, capabilities.dropFiles]) expect(typeof flag).toBe('boolean');
    });

    it('lists, starts and stops backends', async () => {
      const { backend } = make();
      expect(await backend.listBackends()).toEqual([STATUS]);
      expect((await backend.startBackend('shop', null)).state).toBe('running');
      expect((await backend.stopBackend('shop')).state).toBe('stopped');
    });

    it('answers an admin call with status, body, time and type, and does not throw on an error status', async () => {
      const { backend } = make();
      const ok = await backend.admin('shop', { method: 'GET', path: '/definition' });
      expect(ok).toMatchObject({ status: 200, contentType: expect.stringContaining('json') as unknown });
      expect(JSON.parse(ok.body)).toEqual({ name: 'shop' });
      expect(typeof ok.ms).toBe('number');
      const missing = await backend.admin('shop', { method: 'GET', path: '/nothing' });
      expect(missing.status).toBe(404);
    });

    it('runs the certificate command', async () => {
      expect(await make().backend.engineCli('shop', { kind: 'certs' })).toEqual({ code: 0, stdout: 'done', stderr: '' });
    });

    it('delivers live request entries of the backend that was subscribed, and stops after unsubscribing', async () => {
      const harness = make();
      const seen: string[] = [];
      const off = await harness.backend.onRequest((event) => void seen.push(`${event.backend}:${String(event.entry.id)}`));
      await harness.backend.subscribeRequests('shop');
      harness.deliver('shop', ENTRY);
      expect(seen).toEqual(['shop:1']);
      await harness.backend.unsubscribeRequests('shop');
      off();
      harness.deliver('shop', { ...ENTRY, id: 2 });
      expect(seen).toEqual(['shop:1']);
    });

    it('hands an export to the user and says what it is called', async () => {
      const harness = make();
      const where = await harness.backend.saveExport('shop-products', 'json', '[]\n');
      expect(where).toEqual(expect.stringContaining('shop-products'));
      expect(harness.saved()).toEqual(['shop-products']);
    });
  });
}

backendContract('tauri', tauriHarness);
// The web harness records the downloaded file as `<name>.<ext>`; normalise it so both shells can share one assertion.
backendContract('web', () => {
  const harness = webHarness();
  return { ...harness, saved: () => harness.saved().map((name) => name.replace(/\.json$/, '')) };
});

describe('the web transport (AC-LP-1)', () => {
  it('signs in with the one-time code in the body, never in a URL, and keeps the CSRF token for mutations', async () => {
    const harness = webHarness();
    await harness.backend.session?.login('ABCDE-FGHJK');
    const login = harness.calls.find((call) => call.url === '/__session' && call.method === 'POST');
    expect(login?.body).toBe(JSON.stringify({ code: 'ABCDE-FGHJK' }));
    expect(harness.calls.every((call) => !call.url.includes('ABCDE'))).toBe(true);
    await harness.backend.startBackend('shop', null);
    const start = harness.calls.find((call) => call.url === '/__hub/backends/shop/start');
    expect(start?.headers[CSRF_HEADER]).toBe('csrf-1');
    expect(start?.credentials).toBe('same-origin');
  });

  it('sends no CSRF header on reads and never sends an authorization header', async () => {
    const harness = webHarness();
    await harness.backend.session?.check();
    await harness.backend.listBackends();
    await harness.backend.admin('shop', { method: 'GET', path: '/definition' });
    await harness.backend.admin('shop', { method: 'PUT', path: '/definition', body: '{}' });
    for (const call of harness.calls) expect(Object.keys(call.headers).map((name) => name.toLowerCase())).not.toContain('authorization');
    const reads = harness.calls.filter((call) => call.method === 'GET');
    for (const call of reads) expect(call.headers[CSRF_HEADER]).toBeUndefined();
    expect(harness.calls.find((call) => call.method === 'PUT')?.headers[CSRF_HEADER]).toBe('csrf-1');
  });

  it('reports an ended session so the dashboard can ask for a new code', async () => {
    const harness = webHarness({ onExpired: true });
    const expired = vi.fn();
    harness.backend.session?.onExpired(expired);
    await expect(harness.backend.listBackends()).rejects.toThrow('Sign in.');
    expect(expired).toHaveBeenCalledOnce();
  });

  it('refuses the desktop-only actions with a clear message', async () => {
    const { backend } = webHarness();
    await expect(backend.reveal('shop', 'folder')).rejects.toThrow(/only available in the desktop app/);
    await expect(backend.pickNewFolder()).rejects.toThrow(/only available in the desktop app/);
    await expect(backend.engineCli('shop', { kind: 'trustMac' })).rejects.toThrow(/desktop app/);
    expect(await backend.listSimulators()).toEqual([]);
  });

  it('uploads each chosen file with progress, and reports the ones that failed', async () => {
    const harness = webHarness();
    await harness.backend.session?.login('x');
    harness.files.push(new File(['abc'], 'a.png', { type: 'image/png' }));
    const progress: string[] = [];
    await harness.backend.onUpload((event) => void progress.push(`${event.name} ${String(event.sent)}/${String(event.total)} ${String(event.index + 1)}of${String(event.count)}`));
    expect(await harness.backend.uploadMedia('shop')).toEqual({ uploaded: 1, failed: [] });
    expect(progress).toEqual(['a.png 3/3 1of1']);
    const upload = harness.calls.find((call) => call.url.startsWith('/__admin/b/shop/media?name=a.png'));
    expect(upload?.headers[CSRF_HEADER]).toBe('csrf-1');
  });

  it('returns null when the file chooser is cancelled', async () => {
    const harness = webHarness();
    expect(await harness.backend.uploadMedia('shop')).toBeNull();
    expect(await harness.backend.restoreSnapshot()).toBeNull();
    expect(await harness.backend.pickImportFile()).toBeNull();
  });
});
