import { afterEach, describe, expect, it } from 'vitest';

import { parseBackend, type BackendInput } from '../src/schema.ts';
import { chooseProtocol, bearerFrom, protocolsForLog } from '../src/websocket.ts';
import { deepEqual, matchesRule, parseJsonPath } from '../src/ws-rules.ts';

import { serve, stopAll } from './helpers.ts';
import { endpoints, openWs } from './realtime-helpers.ts';
import { rawCall, startSite, stopTeams } from './team-helpers.ts';

afterEach(async () => {
  await stopAll();
  await stopTeams();
});

const ws = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'get.ws', type: 'websocket', method: 'GET', path: '/ws', ...extra });

const definition = (endpoint: Record<string, unknown> = {}): BackendInput => ({
  name: 'sockets',
  auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
  collections: [{ name: 'products', fields: [{ name: 'title', type: 'string', required: true }, { name: 'secret', type: 'string' }] }],
  endpoints: endpoints([
    ws(endpoint),
    { id: 'post.products', type: 'crud', collection: 'products', action: 'create', method: 'POST', path: '/products', hiddenFields: ['secret'] },
    { id: 'post.auth.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
  ]),
});

async function start(endpoint: Record<string, unknown> = {}, options: Parameters<typeof serve>[1] = {}) {
  const running = await serve(definition(endpoint), options);
  const wsUrl = `ws://127.0.0.1:${running.backend.port}/ws`;
  const admin = (path: string, method = 'GET', body?: unknown): Promise<Response> =>
    fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin${path}`, {
      method,
      headers: { authorization: `Bearer ${running.backend.admin.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = (body: unknown): Promise<Response> => fetch(`${running.url}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const clients = async (): Promise<{ id: string }[]> => ((await (await admin('/realtime/get.ws/clients')).json()) as { clients: { id: string }[] }).clients;
  const token = async (): Promise<string> =>
    ((await (await fetch(`${running.url}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) })).json()) as { accessToken: string }).accessToken;
  return { ...running, wsUrl, admin, create, clients, token };
}

const until = async (check: () => Promise<boolean> | boolean, ms = 4000): Promise<void> => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 20));
  }
  throw new Error('condition not met in time');
};

describe('echo and rules', () => {
  it('AC-LP-7 echoes text and binary frames', async () => {
    const { wsUrl } = await start();
    const client = await openWs(wsUrl);
    client.ws.send('hello');
    expect(await client.next()).toBe('hello');
    const binary = new Promise<Buffer>((done) => client.ws.once('message', (data, isBinary) => isBinary && done(data as Buffer)));
    client.ws.send(Buffer.from([1, 2, 3]));
    expect([...(await binary)]).toEqual([1, 2, 3]);
    client.close();
  });

  it('AC-LP-7 answers with the first rule that matches, filling {{message.x}}, and says nothing when none does', async () => {
    const { wsUrl } = await start({
      behavior: 'rules',
      rules: [
        { match: { type: 'ping' }, reply: { type: 'pong', n: '{{message.n}}' } },
        { match: { jsonPath: '$.user.name', equals: 'Ann' }, reply: { hello: '{{message.user.name}}' } },
        { match: { jsonPath: '$.items[1].id' }, reply: 'second item exists' },
        { match: { startsWith: 'GET ' }, reply: 'you asked: {{message}}' },
        { match: { contains: 'bye' }, reply: 'ciao' },
        { match: { endsWith: '?' }, reply: 'maybe' },
        { match: { type: 'ping' }, reply: 'never reached' },
      ],
    });
    const client = await openWs(wsUrl);
    client.ws.send(JSON.stringify({ type: 'ping', n: 7 }));
    expect(await client.nextJson()).toEqual({ type: 'pong', n: 7 });
    client.ws.send(JSON.stringify({ user: { name: 'Ann' } }));
    expect(await client.nextJson()).toEqual({ hello: 'Ann' });
    client.ws.send(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }));
    expect(await client.next()).toBe('second item exists');
    client.ws.send('GET /x');
    expect(await client.next()).toBe('you asked: GET /x');
    client.ws.send('well, bye');
    expect(await client.next()).toBe('ciao');
    client.ws.send('really?');
    expect(await client.next()).toBe('maybe');
    client.ws.send(JSON.stringify({ items: [{ id: 1 }] }));
    await expect(client.next(150)).rejects.toThrow('no message');
    client.close();
  });

  it('AC-LP-7 a rule can broadcast its reply to every client', async () => {
    const { wsUrl } = await start({ behavior: 'rules', rules: [{ match: { type: 'chat' }, reply: { from: 'someone', text: '{{message.text}}' }, broadcast: true }] });
    const a = await openWs(wsUrl);
    const b = await openWs(wsUrl);
    a.ws.send(JSON.stringify({ type: 'chat', text: 'hi all' }));
    expect(await b.nextJson()).toEqual({ from: 'someone', text: 'hi all' });
    expect(await a.nextJson()).toEqual({ from: 'someone', text: 'hi all' });
    a.close();
    b.close();
  });

  it('AC-LP-7 delays a reply by delayMs, and test mode makes it 0', async () => {
    const slow = await start({ behavior: 'rules', rules: [{ match: { contains: 'x' }, reply: 'late', delayMs: 300 }] });
    const client = await openWs(slow.wsUrl);
    client.ws.send('x');
    await expect(client.next(100)).rejects.toThrow('no message');
    expect(await client.next(2000)).toBe('late');
    client.close();
    await stopAll();
    const fast = await start({ behavior: 'rules', rules: [{ match: { contains: 'x' }, reply: 'now', delayMs: 30_000 }] }, { testMode: true });
    const quick = await openWs(fast.wsUrl);
    quick.ws.send('x');
    expect(await quick.next(1000)).toBe('now');
    quick.close();
  });

  it('AC-LP-7 sends the onConnect welcome with placeholders filled', async () => {
    const { wsUrl } = await start({ onConnect: { welcome: true, id: '{{uuid}}', seq: '{{seq}}' } });
    const client = await openWs(wsUrl);
    const welcome = await client.nextJson();
    expect(welcome).toMatchObject({ welcome: true, seq: 1 });
    expect(String(welcome.id)).toMatch(/^[0-9a-f-]{36}$/);
    client.close();
  });

  it('AC-LP-7 has no regular expressions: a definition with regex is refused, and a hostile message cannot hang a rule', async () => {
    expect(() => parseBackend({ name: 'x', endpoints: [ws({ behavior: 'rules', rules: [{ match: { regex: '(a+)+$' }, reply: 'x' }] })] })).toThrow(/regex|Unrecognized/);
    expect(() => parseBackend({ name: 'x', endpoints: [ws({ behavior: 'rules', rules: [{ match: {}, reply: 'x' }] })] })).toThrow('at least one condition');
    expect(() => parseBackend({ name: 'x', endpoints: [ws({ behavior: 'rules', rules: [{ match: { jsonPath: 'not a path' }, reply: 'x' }] })] })).toThrow('Use a path like');
    const evil = `${'a'.repeat(60_000)}!`;
    const started = performance.now();
    expect(matchesRule({ contains: `${'a'.repeat(1000)}b`, endsWith: 'a!' }, { text: evil, json: undefined })).toBe(false);
    expect(performance.now() - started).toBeLessThan(250);
    const { wsUrl } = await start({ behavior: 'rules', rules: [{ match: { contains: 'a'.repeat(500) + 'b' }, reply: 'hit' }, { match: { endsWith: '!' }, reply: 'done' }] });
    const client = await openWs(wsUrl);
    client.ws.send(evil);
    expect(await client.next(2000)).toBe('done');
    client.close();
  });
});

describe('rule matching helpers', () => {
  it('AC-LP-7 reads paths without touching prototypes and compares deeply', () => {
    expect(parseJsonPath('$.a.b[0][\'c d\']')).toEqual(['a', 'b', 0, 'c d']);
    expect(parseJsonPath('a.b')).toBeUndefined();
    expect(parseJsonPath('$..a')).toBeUndefined();
    expect(parseJsonPath(`$.${'a'.repeat(300)}`)).toBeUndefined();
    expect(matchesRule({ jsonPath: '$.constructor' }, { text: '{}', json: { value: {} } })).toBe(false);
    expect(matchesRule({ jsonPath: '$.__proto__' }, { text: '{}', json: { value: {} } })).toBe(false);
    expect(matchesRule({ equals: { a: [1, { b: 2 }] } }, { text: '', json: { value: { a: [1, { b: 2 }] } } })).toBe(true);
    expect(matchesRule({ equals: 'plain' }, { text: 'plain', json: undefined })).toBe(true);
    expect(matchesRule({ jsonPath: '$.n', contains: '4' }, { text: '', json: { value: { n: 142 } } })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('forwarding events', () => {
  it('AC-LP-7 a crud create is sent to connected clients as { event, data } without hidden fields', async () => {
    const { wsUrl, create } = await start({ on: ['products.created'] });
    const client = await openWs(wsUrl);
    await create({ title: 'Lamp', secret: 'internal' });
    const message = await client.nextJson();
    expect(message.event).toBe('products.created');
    expect(message.data).toMatchObject({ collection: 'products', record: { title: 'Lamp' } });
    expect(JSON.stringify(message)).not.toContain('internal');
    client.close();
  });
});

describe('auth', () => {
  it('AC-LP-7 refuses a client without a valid token, and takes the token from the subprotocol, the query or the header', async () => {
    const { wsUrl, token } = await start({ auth: 'bearer' });
    await expect(openWs(wsUrl)).rejects.toThrow('401');
    await expect(openWs(wsUrl, ['bearer', 'not.a.token'])).rejects.toThrow('401');
    const good = await token();
    const viaProtocol = await openWs(wsUrl, ['bearer', good]);
    // The token is never echoed back as the chosen subprotocol.
    expect(viaProtocol.protocol).toBe('bearer');
    viaProtocol.ws.send('hi');
    expect(await viaProtocol.next()).toBe('hi');
    viaProtocol.close();
    const viaQuery = await openWs(`${wsUrl}?token=${good}`);
    viaQuery.close();
    const viaHeader = await openWs(wsUrl, [], { headers: { authorization: `Bearer ${good}` } });
    viaHeader.close();
  });

  it('AC-LP-7 never writes a query or subprotocol token to the request log', async () => {
    const { wsUrl, token, backend } = await start({ auth: 'bearer' });
    const good = await token();
    (await openWs(`${wsUrl}?token=${good}&room=7`)).close();
    (await openWs(wsUrl, ['bearer', good])).close();
    await until(() => backend.engine.requests.snapshot().filter((entry) => entry.method === 'WS').length >= 4);
    const log = JSON.stringify(backend.engine.requests.snapshot());
    expect(log).not.toContain(good);
    expect(log).toContain('room=7');
    expect(log).toContain('[REDACTED]');
  });

  it('AC-LP-7 picks the subprotocol: a supported one first, never the token', () => {
    expect(chooseProtocol(['chat.v1', 'bearer', 'tok'], ['chat.v1'], true)).toBe('chat.v1');
    expect(chooseProtocol(['bearer', 'tok'], [], true)).toBe('bearer');
    expect(chooseProtocol(['bearer', 'tok'], ['chat.v1'], true)).toBe('bearer');
    expect(chooseProtocol(['other'], ['chat.v1'], false)).toBe(false);
    expect(chooseProtocol(['other'], [], false)).toBe('other');
    expect(chooseProtocol(['bearer.abc'], [], true)).toBe(false);
    expect(bearerFrom({ 'sec-websocket-protocol': 'bearer.abc' }, new URLSearchParams())).toEqual({ token: 'abc', via: 'subprotocol' });
    expect(bearerFrom({}, new URLSearchParams('access_token=zzz'))).toEqual({ token: 'zzz', via: 'query' });
    expect(protocolsForLog('chat, bearer, secret-token')).toBe('chat, bearer, [REDACTED]');
  });
});

describe('limits', () => {
  it('AC-LP-7 closes a client that sends more than maxPayloadBytes', async () => {
    const { wsUrl } = await start({ maxPayloadBytes: 100 });
    const client = await openWs(wsUrl);
    client.ws.send('x'.repeat(50));
    expect(await client.next()).toHaveLength(50);
    client.ws.send('x'.repeat(500));
    expect(await client.closed).toBe(1009);
  });

  it('AC-LP-7 has a 64 KB default payload limit', async () => {
    expect(parseBackend({ name: 'x', endpoints: [ws()] }).endpoints[0]).toMatchObject({ maxPayloadBytes: 65_536, behavior: 'echo', maxConnections: 100, pingIntervalMs: 30_000 });
    const { wsUrl } = await start();
    const client = await openWs(wsUrl);
    client.ws.send('y'.repeat(70_000));
    expect(await client.closed).toBe(1009);
  });

  it('AC-LP-7 answers 429 past maxConnections and past maxConnectionsPerIp', async () => {
    const total = await start({ maxConnections: 1 });
    const only = await openWs(total.wsUrl);
    await expect(openWs(total.wsUrl)).rejects.toThrow('429');
    only.close();
    await until(async () => (await total.clients()).length === 0);
    (await openWs(total.wsUrl)).close();
    await stopAll();
    const perIp = await start({ maxConnectionsPerIp: 1 });
    const first = await openWs(perIp.wsUrl);
    await expect(openWs(perIp.wsUrl)).rejects.toThrow('429');
    first.close();
  });

  it('AC-LP-7 closes a client that is too slow to read (backpressure) with 1013', async () => {
    const { wsUrl, admin, clients } = await start({ maxBufferedBytes: 2048, pingIntervalMs: 0 });
    const slow = await openWs(wsUrl);
    slow.ws.pause();
    // The client does not read: sooner or later the kernel buffers fill and the server's own queue grows past the limit.
    const big = 'z'.repeat(512 * 1024);
    await until(async () => {
      await admin('/realtime/get.ws/send', 'POST', { data: big });
      return (await clients()).length === 0;
    }, 8000);
    expect(await clients()).toHaveLength(0);
  });

  it('AC-LP-7 drops a client that stops answering pings, and clears its timers when it leaves', async () => {
    const { wsUrl, clients, backend } = await start({ pingIntervalMs: 40 });
    const quiet = await openWs(wsUrl);
    quiet.ws.pause();
    await until(async () => (await clients()).length === 0);
    const live = await openWs(wsUrl);
    await new Promise((done) => setTimeout(done, 200));
    // A client that answers stays.
    expect(await clients()).toHaveLength(1);
    live.close();
    await until(() => backend.engine.realtime.existing('get.ws')?.size === 0);
  });

  it('AC-LP-7 a plain GET to a websocket endpoint answers 426', async () => {
    const { url } = await start();
    const answer = await fetch(`${url}/ws`);
    expect(answer.status).toBe(426);
    expect(answer.headers.get('upgrade')).toBe('websocket');
  });

  it('AC-LP-7 refuses an upgrade for a path with no websocket endpoint', async () => {
    const { backend } = await start();
    await expect(openWs(`ws://127.0.0.1:${backend.port}/nothing`)).rejects.toThrow('404');
    await expect(openWs(`ws://127.0.0.1:${backend.port}/products`)).rejects.toThrow('400');
  });
});

describe('request log and admin', () => {
  it('AC-LP-7 logs connect, messages (truncated, redacted) and disconnect', async () => {
    const { wsUrl, backend } = await start();
    const client = await openWs(wsUrl);
    client.ws.send(JSON.stringify({ password: 'hunter2', note: 'hi' }));
    await client.next();
    client.close();
    await until(() => backend.engine.requests.snapshot().filter((entry) => entry.method === 'WS').length >= 3);
    const entries = backend.engine.requests.snapshot().filter((entry) => entry.method === 'WS');
    expect(entries.map((entry) => entry.status)).toEqual([101, 200, 200]);
    expect(JSON.stringify(entries)).not.toContain('hunter2');
    expect(JSON.stringify(entries[1]?.req)).toContain('hi');
    expect(entries[1]?.url).toBe('/ws');
    // The stats count the connection under the endpoint.
    expect(backend.engine.stats.snapshot().endpoints.find((item) => item.id === 'get.ws')?.count).toBeGreaterThanOrEqual(3);
  });

  it('AC-LP-7 lists clients, sends to one or all, and disconnects a client', async () => {
    const { wsUrl, admin, clients } = await start();
    const a = await openWs(wsUrl);
    const b = await openWs(wsUrl);
    const list = (await (await admin('/realtime/get.ws/clients')).json()) as { type: string; clients: { id: string; ipHash: string; protocol?: string }[] };
    expect(list.type).toBe('websocket');
    expect(list.clients).toHaveLength(2);
    expect(list.clients[0]?.ipHash).toMatch(/^[0-9a-f]{12}$/);
    expect(await (await admin('/realtime/get.ws/send', 'POST', { data: 'to all' })).json()).toEqual({ sent: 2 });
    expect(await a.next()).toBe('to all');
    expect(await b.next()).toBe('to all');
    const first = list.clients[0]?.id ?? '';
    expect(await (await admin('/realtime/get.ws/send', 'POST', { event: 'note', data: { n: 1 }, clientId: first })).json()).toEqual({ sent: 1 });
    const got = await Promise.race([a.nextJson(400).catch(() => undefined), b.nextJson(400).catch(() => undefined)]);
    expect(got).toEqual({ event: 'note', data: { n: 1 } });
    expect((await admin(`/realtime/get.ws/clients/${first}`, 'DELETE')).status).toBe(200);
    await until(async () => (await clients()).length === 1);
    await Promise.race([a.closed, b.closed]);
    const messages = ((await (await admin('/realtime/get.ws/messages')).json()) as { messages: { direction: string }[] }).messages;
    expect(messages.map((message) => message.direction)).toContain('out');
    a.close();
    b.close();
  });
});

describe('team server', () => {
  async function teamWith(endpoint: Record<string, unknown>) {
    const site = await startSite();
    const added = await site.owner.admin('demo', 'POST', '/endpoints', ws(endpoint));
    expect(added.status, added.body).toBe(200);
    return site;
  }

  it('AC-LP-7 serves a websocket under /b/<id>/', async () => {
    const site = await teamWith({});
    const client = await openWs(`ws://127.0.0.1:${site.team.port}/b/demo/ws`);
    client.ws.send('through the team server');
    expect(await client.next()).toBe('through the team server');
    client.close();
    await expect(openWs(`ws://127.0.0.1:${site.team.port}/b/nobody/ws`)).rejects.toThrow('404');
    await expect(openWs(`ws://127.0.0.1:${site.team.port}/b/demo/__sessions`)).rejects.toThrow('404');
    await expect(openWs(`ws://127.0.0.1:${site.team.port}/ws`)).rejects.toThrow('404');
  });

  it('AC-LP-7 serves a websocket under /s/<id>/ of a CI session, and stopping the server closes open sockets', async () => {
    const site = await teamWith({ on: ['products.created'] });
    const made = await site.owner.hub('POST', '/backends/demo/api-keys', { name: 'ci', scope: 'sessions' });
    const key = (made.json() as { key: string }).key;
    const session = await rawCall(site.team.port, { method: 'POST', path: '/b/demo/__sessions', headers: { authorization: `Bearer ${key}` } });
    expect(session.status, session.body).toBe(201);
    const id = (session.json() as { id: string }).id;
    const client = await openWs(`ws://127.0.0.1:${site.team.port}/s/${id}/ws`);
    client.ws.send('in a session');
    expect(await client.next()).toBe('in a session');
    // The session is its own copy: a create there reaches its socket and not the backend's.
    const created = await rawCall(site.team.port, { method: 'POST', path: `/s/${id}/products`, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'T', price: 1 }) });
    expect(created.status, created.body).toBe(201);
    expect((await client.nextJson()).event).toBe('products.created');
    await expect(openWs(`ws://127.0.0.1:${site.team.port}/s/${'0'.repeat(32)}/ws`)).rejects.toThrow('404');
    // Stopping the server must not hang on the open socket.
    await site.team.stop();
    expect(await client.closed).toBeTypeOf('number');
  });

  it('AC-LP-7 the admin routes of the Live panel follow the roles: a viewer reads, an editor sends and disconnects', async () => {
    const site = await teamWith({});
    const { member } = await import('./team-helpers.ts');
    const viewer = await member(site, 'v@example.com', 'viewer');
    const editor = await member(site, 'e@example.com', 'editor');
    const client = await openWs(`ws://127.0.0.1:${site.team.port}/b/demo/ws`);
    expect((await viewer.admin('demo', 'GET', '/realtime/get.ws/clients')).status).toBe(200);
    expect((await viewer.admin('demo', 'GET', '/realtime/get.ws/messages')).status).toBe(200);
    expect((await viewer.admin('demo', 'POST', '/realtime/get.ws/send', { data: 'x' })).status).toBe(403);
    expect((await editor.admin('demo', 'POST', '/realtime/get.ws/send', { data: 'x' })).status).toBe(200);
    expect(await client.next()).toBe('x');
    const id = ((await editor.admin('demo', 'GET', '/realtime/get.ws/clients')).json() as { clients: { id: string }[] }).clients[0]?.id ?? '';
    expect((await viewer.admin('demo', 'DELETE', `/realtime/get.ws/clients/${id}`)).status).toBe(403);
    expect((await editor.admin('demo', 'DELETE', `/realtime/get.ws/clients/${id}`)).status).toBe(200);
    expect(await client.closed).toBe(1000);
    // The audit log keeps the manual send.
    const audit = await site.owner.hub('GET', '/backends/demo/audit');
    expect(audit.body).toContain('realtime');
  });
});
