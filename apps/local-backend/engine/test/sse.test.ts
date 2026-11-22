import { afterEach, describe, expect, it } from 'vitest';

import { parseBackend, type BackendInput } from '../src/schema.ts';
import { sseFrame } from '../src/sse.ts';
import { ADMIN_ROLE_TABLE, decide } from '../src/roles.ts';

import { serve, stopAll } from './helpers.ts';
import { endpoints, openSse } from './realtime-helpers.ts';

afterEach(stopAll);

const sse = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'get.live', type: 'sse', method: 'GET', path: '/live', ...extra });

const definition = (endpoint: Record<string, unknown> = {}, extra: Partial<BackendInput> = {}): BackendInput => ({
  name: 'live',
  auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
  collections: [{ name: 'products', fields: [{ name: 'title', type: 'string', required: true }, { name: 'secret', type: 'string' }] }],
  endpoints: endpoints([
    sse(endpoint),
    { id: 'post.products', type: 'crud', collection: 'products', action: 'create', method: 'POST', path: '/products', hiddenFields: ['secret'] },
    { id: 'post.auth.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
  ]),
  ...extra,
});

async function start(endpoint: Record<string, unknown> = {}, options: Parameters<typeof serve>[1] = {}) {
  const running = await serve(definition(endpoint), options);
  const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${running.backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = (body: unknown): Promise<Response> => fetch(`${running.url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const clients = async (): Promise<{ id: string }[]> => ((await (await admin('/realtime/get.live/clients')).json()) as { clients: { id: string }[] }).clients;
  return { ...running, admin, create, clients };
}

const until = async (check: () => Promise<boolean> | boolean, ms = 2000): Promise<void> => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error('condition not met in time');
};

describe('SSE framing', () => {
  it('AC-LP-7 writes id, event, retry and one data line per line of text, ended by a blank line', () => {
    expect(sseFrame({ id: 4, event: 'tick', data: 'a\nb\r\nc' })).toBe('id: 4\nevent: tick\ndata: a\ndata: b\ndata: c\n\n');
    expect(sseFrame({ retry: 2500 })).toBe('retry: 2500\n\n');
    // A line break in an event name cannot start a second field.
    expect(sseFrame({ event: 'x\ndata: injected', data: '1' })).toBe('event: x data: injected\ndata: 1\n\n');
  });

  it('AC-LP-7 serves text/event-stream with the retry hint, then the script in order with placeholders and repeat', async () => {
    const { url } = await start({
      retryMs: 1234,
      script: [
        { event: 'hello', data: { n: '{{seq}}', who: 'world' } },
        { data: 'line one\nline two' },
        { event: 'tick', data: { tick: '{{seq}}' }, repeat: 2 },
      ],
    });
    const stream = await openSse(`${url}/live`);
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(stream.headers.get('cache-control')).toContain('no-cache');
    expect(await stream.next(2000, true)).toEqual({ retry: '1234' });
    expect(await stream.next()).toEqual({ event: 'hello', data: '{"n":1,"who":"world"}' });
    expect(await stream.next()).toEqual({ data: 'line one\nline two' });
    expect(await stream.next()).toEqual({ event: 'tick', data: '{"tick":3}' });
    expect(await stream.next()).toEqual({ event: 'tick', data: '{"tick":4}' });
    stream.close();
  });

  it('AC-LP-7 sends a heartbeat comment when heartbeatMs is set', async () => {
    const { url } = await start({ heartbeatMs: 30 });
    const stream = await openSse(`${url}/live`);
    await stream.next(2000, true); // retry
    expect((await stream.next(2000, true)).comment).toBe('keep-alive');
    stream.close();
  });
});

describe('SSE forwarding and resume', () => {
  it('AC-LP-7 a crud create is forwarded as products.created, without the fields a crud endpoint hides', async () => {
    const { url, create } = await start({ on: ['products.created'] });
    const stream = await openSse(`${url}/live`);
    await stream.next(2000, true);
    await create({ title: 'Lamp', secret: 'internal' });
    const message = await stream.next();
    expect(message.event).toBe('products.created');
    const payload = JSON.parse(message.data ?? '{}') as { collection: string; id: number; record: Record<string, unknown> };
    expect(payload).toMatchObject({ collection: 'products', record: { title: 'Lamp' } });
    expect(payload.record).not.toHaveProperty('secret');
    stream.close();
  });

  it('AC-LP-7 ignores events it does not list', async () => {
    const { url, create } = await start({ on: ['orders.*'] });
    const stream = await openSse(`${url}/live`);
    await stream.next(2000, true);
    await create({ title: 'Lamp' });
    await expect(stream.next(200)).rejects.toThrow('no event');
    stream.close();
  });

  it('AC-LP-7 Last-Event-ID resumes from the buffer and does not run the script again', async () => {
    const { url, create } = await start({ on: ['products.created'], script: [{ data: 'welcome' }] });
    const first = await openSse(`${url}/live`);
    await first.next(2000, true);
    expect((await first.next()).data).toBe('welcome');
    await create({ title: 'One' });
    const one = await first.next();
    await create({ title: 'Two' });
    const two = await first.next();
    expect(one.id).toBeDefined();
    expect(Number(two.id)).toBeGreaterThan(Number(one.id));
    first.close();
    const second = await openSse(`${url}/live`, { 'last-event-id': one.id ?? '' });
    await second.next(2000, true);
    const missed = await second.next();
    expect(missed.id).toBe(two.id);
    expect(JSON.parse(missed.data ?? '{}')).toMatchObject({ record: { title: 'Two' } });
    await expect(second.next(150)).rejects.toThrow('no event');
    second.close();
  });

  it('AC-LP-7 the resume buffer keeps only bufferSize messages', async () => {
    const { url, create } = await start({ on: ['products.created'], bufferSize: 2 });
    const watcher = await openSse(`${url}/live`);
    await watcher.next(2000, true);
    for (const title of ['a', 'b', 'c']) await create({ title });
    for (let i = 0; i < 3; i += 1) await watcher.next();
    const late = await openSse(`${url}/live`, { 'last-event-id': '1' });
    await late.next(2000, true);
    expect((JSON.parse((await late.next()).data ?? '{}') as { record: { title: string } }).record.title).toBe('b');
    watcher.close();
    late.close();
  });
});

describe('SSE test mode', () => {
  it('AC-LP-7 turns every delay into 0 and keeps the order of the messages', async () => {
    const { url } = await start({ script: [{ data: 'first', delayMs: 30_000 }, { data: 'second', delayMs: 30_000 }, { data: 'third', delayMs: 30_000, repeat: 2 }] }, { testMode: true });
    const stream = await openSse(`${url}/live`);
    await stream.next(2000, true);
    const seen: string[] = [];
    for (let i = 0; i < 4; i += 1) seen.push((await stream.next(1000)).data ?? '');
    expect(seen).toEqual(['first', 'second', 'third', 'third']);
    stream.close();
  });

  it('AC-LP-7 keeps a delay when the request asks for it with x-tempo-test-delays', async () => {
    const { url } = await start({ script: [{ data: 'slow', delayMs: 400 }] }, { testMode: true });
    const stream = await openSse(`${url}/live`, { 'x-tempo-test-delays': '1' });
    await stream.next(2000, true);
    await expect(stream.next(100)).rejects.toThrow('no event');
    expect((await stream.next(2000)).data).toBe('slow');
    stream.close();
  });
});

describe('SSE auth and limits', () => {
  it('AC-LP-7 needs a bearer token when the endpoint asks for one', async () => {
    const { url } = await start({ auth: 'bearer', script: [{ data: 'secret news' }] });
    expect((await fetch(`${url}/live`)).status).toBe(401);
    const login = (await (
      await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) })
    ).json()) as { accessToken: string };
    const stream = await openSse(`${url}/live`, { authorization: `Bearer ${login.accessToken}` });
    expect(stream.status).toBe(200);
    await stream.next(2000, true);
    expect((await stream.next()).data).toBe('secret news');
    stream.close();
  });

  it('AC-LP-7 answers 429 past maxConnections, and past maxConnectionsPerIp', async () => {
    const total = await start({ maxConnections: 2, maxConnectionsPerIp: 5 });
    const a = await openSse(`${total.url}/live`);
    const b = await openSse(`${total.url}/live`);
    const refused = await fetch(`${total.url}/live`);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('5');
    await refused.body?.cancel();
    a.close();
    b.close();
    await stopAll();
    const perIp = await start({ maxConnections: 10, maxConnectionsPerIp: 1 });
    const only = await openSse(`${perIp.url}/live`);
    const second = await fetch(`${perIp.url}/live`);
    expect(second.status).toBe(429);
    await second.body?.cancel();
    only.close();
  });

  it('AC-LP-7 frees the slot, clears the timers and forgets the client when the client disconnects', async () => {
    const { url, clients, backend } = await start({ maxConnections: 1, heartbeatMs: 20, idleTimeoutMs: 60_000, script: [{ data: 'x', delayMs: 5000, repeat: 50 }] });
    const stream = await openSse(`${url}/live`);
    await stream.next(2000, true);
    expect(await clients()).toHaveLength(1);
    stream.close();
    await until(async () => (await clients()).length === 0);
    // The heartbeat and the script timers are gone: a new client fits, and no write goes to the dead one.
    const again = await openSse(`${url}/live`);
    expect(again.status).toBe(200);
    again.close();
    await until(() => backend.engine.realtime.existing('get.live')?.size === 0);
  });

  it('AC-LP-7 closes a client that got no message for idleTimeoutMs', async () => {
    const { url } = await start({ idleTimeoutMs: 80, heartbeatMs: 20 });
    const stream = await openSse(`${url}/live`);
    await stream.ended;
    expect(stream.status).toBe(200);
  });
});

describe('SSE admin', () => {
  it('AC-LP-7 lists clients without addresses, sends to all or one, logs messages, and disconnects a client', async () => {
    const { url, admin, clients } = await start();
    const a = await openSse(`${url}/live`);
    const b = await openSse(`${url}/live`);
    await a.next(2000, true);
    await b.next(2000, true);
    const list = (await (await admin('/realtime/get.live/clients')).json()) as { type: string; clients: { id: string; connectedAt: string; ipHash: string }[] };
    expect(list.type).toBe('sse');
    expect(list.clients).toHaveLength(2);
    for (const client of list.clients) {
      expect(client.ipHash).toMatch(/^[0-9a-f]{12}$/);
      expect(JSON.stringify(client)).not.toContain('127.0.0.1');
      expect(Date.parse(client.connectedAt)).not.toBeNaN();
    }
    expect((await (await admin('/realtime/get.live/send', 'POST', { event: 'notice', data: { hi: 1 } })).json())).toEqual({ sent: 2 });
    expect(await a.next()).toMatchObject({ event: 'notice', data: '{"hi":1}' });
    expect(await b.next()).toMatchObject({ event: 'notice' });
    const target = list.clients[0]?.id ?? '';
    expect((await (await admin('/realtime/get.live/send', 'POST', { data: 'just you', clientId: target })).json())).toEqual({ sent: 1 });
    const messages = ((await (await admin('/realtime/get.live/messages')).json()) as { messages: { direction: string }[] }).messages;
    expect(messages.some((message) => message.direction === 'out')).toBe(true);
    expect((await admin(`/realtime/get.live/clients/${target}`, 'DELETE')).status).toBe(200);
    await until(async () => (await clients()).length === 1);
    expect((await admin('/realtime/get.live/clients/nobody', 'DELETE')).status).toBe(404);
    expect((await admin('/realtime/nope/clients')).status).toBe(404);
    expect((await admin('/realtime/get.live/send', 'POST', { event: 'x' })).status).toBe(400);
    a.close();
    b.close();
  });

  it('AC-LP-7 the role table lets a viewer read the Live panel and needs the editor role to send or disconnect', () => {
    expect(ADMIN_ROLE_TABLE['GET /realtime/:endpointId/clients']).toBe('viewer');
    expect(ADMIN_ROLE_TABLE['GET /realtime/:endpointId/messages']).toBe('viewer');
    expect(ADMIN_ROLE_TABLE['POST /realtime/:endpointId/send']).toBe('editor');
    expect(ADMIN_ROLE_TABLE['DELETE /realtime/:endpointId/clients/:clientId']).toBe('editor');
    const viewer = { actor: { kind: 'account', id: '1', label: 'v' }, role: 'viewer' } as const;
    expect(decide(viewer, 'GET /realtime/:endpointId/clients').ok).toBe(true);
    expect(decide(viewer, 'POST /realtime/:endpointId/send').ok).toBe(false);
  });

  it('AC-LP-7 an edited endpoint disconnects its clients, since they hold the old script', async () => {
    const { url, manager, backend } = await (async () => {
      const running = await start();
      return { ...running, manager: running.backend.manager };
    })();
    const stream = await openSse(`${url}/live`);
    await stream.next(2000, true);
    const next = manager.definition();
    next.endpoints = (next.endpoints ?? []).map((endpoint) => (endpoint.id === 'get.live' ? ({ ...endpoint, retryMs: 999 } as typeof endpoint) : endpoint));
    await manager.commit(next);
    await stream.ended;
    expect(backend.engine.realtime.existing('get.live')).toBeUndefined();
  });
});

describe('SSE definition', () => {
  it('AC-LP-7 only GET is allowed, and a bad event pattern is refused', () => {
    expect(() => parseBackend({ name: 'x', endpoints: [sse({ method: 'POST' })] })).toThrow('An sse endpoint uses GET');
    expect(() => parseBackend({ name: 'x', endpoints: [sse({ on: ['bad name'] })] })).toThrow('event');
    expect(parseBackend({ name: 'x', endpoints: [sse()] }).endpoints[0]).toMatchObject({ retryMs: 3000, heartbeatMs: 15_000, maxConnections: 100, maxConnectionsPerIp: 10, bufferSize: 100 });
  });
});
