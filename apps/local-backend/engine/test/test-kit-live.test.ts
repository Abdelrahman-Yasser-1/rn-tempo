import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { setupTempoBackend, type TempoBackend } from '../src/test-kit/index.ts';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'jest-project', 'backend');
const open: TempoBackend[] = [];
const temp: string[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((backend) => backend.stop()));
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The fixture backend with an sse, a websocket and a graphql endpoint added, started without Jest hooks. */
async function kit(): Promise<TempoBackend> {
  const dir = mkdtempSync(join(tmpdir(), 'tempo-kit-live-'));
  temp.push(dir);
  cpSync(FIXTURE, join(dir, 'backend'), { recursive: true });
  const file = join(dir, 'backend', 'backend.json');
  const definition = JSON.parse(readFileSync(file, 'utf8')) as { endpoints: unknown[] };
  definition.endpoints.push(
    { id: 'get.live', type: 'sse', method: 'GET', path: '/live', script: [{ event: 'hello', data: { n: '{{seq}}' }, delayMs: 30_000 }, { data: 'second', delayMs: 30_000 }], on: ['products.created'] },
    { id: 'get.ws', type: 'websocket', method: 'GET', path: '/ws', behavior: 'rules', rules: [{ match: { type: 'ping' }, reply: { type: 'pong' } }], on: ['products.*'] },
    { id: 'post.graphql', type: 'graphql', method: 'POST', path: '/graphql' },
  );
  writeFileSync(file, JSON.stringify(definition));
  const backend = setupTempoBackend({ source: join(dir, 'backend'), hooks: false });
  open.push(backend);
  await backend.start();
  return backend;
}

describe('test kit: realtime helpers', () => {
  it('AC-LP-7 backend.sse reads a script (delays are 0 in test mode) and a data change, as an async iterator', async () => {
    const backend = await kit();
    const stream = await backend.sse('/live');
    expect(await stream.next()).toEqual({ event: 'hello', data: '{"n":1}' });
    expect((await stream.next()).data).toBe('second');
    backend.data.insert('products', { title: 'Kit lamp', price: 5 });
    const event = await stream.json<{ collection: string; record: { title: string } }>();
    expect(event).toMatchObject({ collection: 'products', record: { title: 'Kit lamp' } });
    stream.close();
    // for await ends when the stream does.
    const again = await backend.sse('/live');
    const seen: string[] = [];
    for await (const item of again) {
      seen.push(item.data);
      if (seen.length === 2) break;
    }
    expect(seen).toEqual(['{"n":1}', 'second']);
  });

  it('AC-LP-7 backend.sse can resume with lastEventId and refuses a path that is not a stream', async () => {
    const backend = await kit();
    const watcher = await backend.sse('/live');
    await watcher.next();
    await watcher.next();
    backend.data.insert('products', { title: 'One', price: 1 });
    const first = await watcher.next();
    backend.data.insert('products', { title: 'Two', price: 1 });
    await watcher.next();
    watcher.close();
    const resumed = await backend.sse('/live', { lastEventId: first.id ?? '' });
    expect((await resumed.json<{ record: { title: string } }>()).record.title).toBe('Two');
    resumed.close();
    await expect(backend.sse('/products')).rejects.toThrow('instead of an event stream');
  });

  it('AC-LP-7 backend.ws sends and receives, sees data changes, and carries a token in the subprotocol', async () => {
    const backend = await kit();
    const socket = await backend.ws('/ws');
    socket.send({ type: 'ping' });
    expect(await socket.json()).toEqual({ type: 'pong' });
    backend.data.insert('products', { title: 'Kit lamp', price: 5 });
    expect(await socket.json()).toMatchObject({ event: 'products.created', data: { record: { title: 'Kit lamp' } } });
    await socket.close();
    expect(await socket.closed).toBeTypeOf('number');
    await expect(backend.ws('/nope')).rejects.toThrow('404');
    const authed = await backend.ws('/ws', { token: 'abc.def.ghi' });
    expect(authed.protocol).toBe('bearer');
    await authed.close();
  });

  it('AC-LP-7 backend.graphql runs a query with variables, and a subscription over backend.ws', async () => {
    const backend = await kit();
    const answer = await backend.graphql<{ products: { title: string }[] }>('query($n: Int) { products(limit: $n) { id title } }', { n: 2 });
    expect(answer.status).toBe(200);
    expect(answer.errors).toBeUndefined();
    expect(answer.data?.products).toHaveLength(2);
    const failed = await backend.graphql('{ nope }');
    expect(failed.status).toBe(400);
    expect(failed.errors?.[0]?.message).toContain('nope');
    const socket = await backend.ws('/graphql', { protocols: ['graphql-transport-ws'] });
    expect(socket.protocol).toBe('graphql-transport-ws');
    socket.send({ type: 'connection_init' });
    expect(await socket.json()).toEqual({ type: 'connection_ack' });
    socket.send({ id: '1', type: 'subscribe', payload: { query: 'subscription { productsCreated { title } }' } });
    await new Promise((done) => setTimeout(done, 80));
    backend.data.insert('products', { title: 'From the kit', price: 1 });
    expect(await socket.json()).toMatchObject({ id: '1', type: 'next', payload: { data: { productsCreated: { title: 'From the kit' } } } });
    await socket.close();
  });

  it('AC-LP-7 reset() still brings the data back on a backend with realtime endpoints', async () => {
    const backend = await kit();
    backend.data.insert('products', { title: 'Temporary', price: 1 });
    backend.reset();
    expect(backend.data.list('products').some((row) => row.title === 'Temporary')).toBe(false);
  });
});
