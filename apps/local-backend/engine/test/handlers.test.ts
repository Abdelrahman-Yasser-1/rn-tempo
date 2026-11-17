import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { BackendInput } from '../src/schema.ts';
import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const endpoint = (id: string, extra: Record<string, unknown> = {}): NonNullable<BackendInput['endpoints']>[number] =>
  ({ id, type: 'handler', method: 'POST', path: `/h/${id}`, file: `handlers/${id}.js`, ...extra }) as NonNullable<BackendInput['endpoints']>[number];

const definition = (ids: string[], extra: Partial<BackendInput> = {}): BackendInput => ({
  name: 'handlers',
  auth: { seedUsers: [{ username: 'emilys', password: 'emilyspass' }] },
  collections: [
    { name: 'products', fields: [{ name: 'title', type: 'string', required: true }, { name: 'price', type: 'number' }], seed: [{ title: 'Lamp', price: 10 }, { title: 'Desk', price: 20 }, { title: 'Chair', price: 30 }] },
  ],
  endpoints: [
    ...ids.map((id) => endpoint(id, id === 'whoami' ? { auth: 'bearer' } : id.startsWith('slow') || id === 'loop' ? { timeoutMs: 400 } : {})),
    { id: 'login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login' },
  ],
  ...extra,
});

function write(dir: string, name: string, source: string): void {
  const file = join(dir, 'handlers', name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
}

const post = (url: string, body: unknown = {}, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Starts a backend whose handlers are written before it opens, as a user would have them in the folder. */
async function start(files: Record<string, string>, extra: Partial<BackendInput> = {}) {
  const ids = Object.keys(files).map((name) => name.replace(/\.js$/, ''));
  const running = await serve(definition(ids, extra));
  for (const [name, source] of Object.entries(files)) write(running.dir, name, source);
  return running;
}

describe('answers', () => {
  it('returns { status, headers, body }, a plain body, nothing (204) and text', async () => {
    const { url } = await start({
      'full.js': `export default async () => ({ status: 201, headers: { 'X-Made-By': 'handler' }, body: { ok: true } });`,
      'plain.js': `export default async () => ({ hello: 'world', status: 'fine' });`,
      'nothing.js': `export default async () => undefined;`,
      'text.js': `export default async () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'plain words' });`,
      'cjs.js': `module.exports = async function (ctx) { return { n: ctx.req.body.n + 1 }; };`,
    });
    const full = await post(`${url}/h/full`);
    expect(full.status).toBe(201);
    expect(full.headers.get('x-made-by')).toBe('handler');
    expect(await json(full)).toEqual({ ok: true });
    expect(await json(await post(`${url}/h/plain`))).toEqual({ hello: 'world', status: 'fine' }); // a string `status` is not an answer shape
    expect((await post(`${url}/h/nothing`)).status).toBe(204);
    const text = await post(`${url}/h/text`);
    expect(await text.text()).toBe('plain words');
    expect(text.headers.get('content-type')).toBe('text/plain');
    expect(await json(await post(`${url}/h/cjs`, { n: 41 }))).toEqual({ n: 42 });
  });

  it('gets the request: method, path, params, query, headers, body and the scenario', async () => {
    const running = await serve({
      name: 'req',
      endpoints: [{ id: 'echo', type: 'handler', method: 'POST', path: '/echo/:thing', file: 'handlers/echo.js', scenarios: { calm: { delayMs: 0 } } }],
    });
    write(running.dir, 'echo.js', `export default async (ctx) => ({ ...ctx.req, scenario: ctx.scenario, hasDb: typeof ctx.db.list, hasMedia: typeof ctx.media.get, hasLog: typeof ctx.log.info });`);
    const answer = await json(await post(`${running.url}/echo/abc?x=1&y=two`, { a: [1] }, { 'x-tempo-scenario': 'calm', 'x-custom': 'yes' }));
    expect(answer).toMatchObject({ method: 'POST', path: '/echo/abc', params: { thing: 'abc' }, query: { x: '1', y: 'two' }, body: { a: [1] }, scenario: 'calm', hasDb: 'function', hasMedia: 'function', hasLog: 'function' });
    expect((answer.headers as Record<string, string>)['x-custom']).toBe('yes');
  });

  it('knows the signed-in user on a bearer endpoint', async () => {
    const { url } = await start({ 'whoami.js': `export default async (ctx) => ({ user: ctx.req.user, same: ctx.auth.user.id === ctx.req.user.id });` });
    expect((await post(`${url}/h/whoami`)).status).toBe(401);
    const login = (await (await post(`${url}/auth/login`, { username: 'emilys', password: 'emilyspass' })).json()) as { accessToken: string; id: number };
    expect(await json(await post(`${url}/h/whoami`, {}, { authorization: `Bearer ${login.accessToken}` }))).toEqual({ user: { id: login.id, username: 'emilys' }, same: true });
  });
});

describe('AC-LB-5 a handler endpoint runs its JS with db access', () => {
  it('counts, lists, gets, creates, updates and deletes through the main thread', async () => {
    const { url, backend } = await start({
      'products.js': `
        export default async function (ctx) {
          const before = await ctx.db.count('products');
          const { rows, total } = await ctx.db.list('products', { sort: '-price', limit: 2 });
          const cheap = await ctx.db.list('products', { where: { title: 'Lamp' } });
          const one = await ctx.db.get('products', 2);
          const created = await ctx.db.create('products', { title: 'Sofa', price: 99 });
          const updated = await ctx.db.update('products', created.id, { price: 89 });
          const gone = await ctx.db.delete('products', 1);
          const missing = await ctx.db.get('products', 4242);
          let rejected = null;
          try { await ctx.db.create('products', { price: 1 }); } catch (error) { rejected = error.message; }
          let noSuch = null;
          try { await ctx.db.list('nothing'); } catch (error) { noSuch = error.message; }
          return { before, titles: rows.map((r) => r.title), total, cheap: cheap.rows.length, one: one.title, created: created.title, updated: updated.price, gone: gone.title, missing, rejected, noSuch, after: await ctx.db.count('products') };
        }`,
    });
    const answer = await json(await post(`${url}/h/products`));
    expect(answer).toEqual({
      before: 3,
      titles: ['Chair', 'Desk'],
      total: 3,
      cheap: 1,
      one: 'Desk',
      created: 'Sofa',
      updated: 89,
      gone: 'Lamp',
      missing: null,
      rejected: 'body.title: Required.',
      noSuch: 'No collection "nothing".',
      after: 3,
    });
    expect(backend.engine.store.count('products')).toBe(3);
  });

  it('cannot run raw SQL: only the five collection calls exist on db', async () => {
    const { url } = await start({ 'sql.js': `export default async (ctx) => ({ keys: Object.keys(ctx.db).sort(), query: typeof ctx.db.query, exec: typeof ctx.db.exec });` });
    expect(await json(await post(`${url}/h/sql`))).toEqual({ keys: ['count', 'create', 'delete', 'get', 'list', 'update'], query: 'undefined', exec: 'undefined' });
  });

  it('an infinite loop is stopped by the timeout: 504, a log entry, and the engine keeps serving', async () => {
    const { url, backend, dir } = await start({
      'loop.js': `export default async () => { while (true) {} };`,
      'ok.js': `export default async (ctx) => ({ count: await ctx.db.count('products') });`,
    });
    const started = Date.now();
    const stuck = await post(`${url}/h/loop`);
    expect(stuck.status).toBe(504);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(stuck.headers.get('content-type')).toContain('application/problem+json');
    expect((await fetch(`${url}/__health`)).status).toBe(200);
    expect(await json(await post(`${url}/h/ok`))).toEqual({ count: 3 });
    // A second loop also ends, even with another request in flight.
    const [again, fine] = await Promise.all([post(`${url}/h/loop`), post(`${url}/h/ok`)]);
    expect([again.status, fine.status]).toEqual([504, 200]);
    // The request log and engine.log both record it.
    expect(backend.engine.requests.snapshot(0).some((entry) => entry.status === 504 && entry.url.endsWith('/h/loop'))).toBe(true);
    const log = readFileSync(join(dir, '.data/logs/engine.log'), 'utf8');
    expect(log).toMatch(/handler did not finish/);
    expect(log).toMatch(/"outcome":"timeout"/);
  });

  it('a handler that throws is a 500 with its message, and the engine goes on', async () => {
    const { url } = await start({
      'boom.js': `export default async () => { throw new Error('kaboom'); };`,
      'later.js': `export default async () => { setTimeout(() => { throw new Error('async kaboom'); }, 0); await new Promise((r) => setTimeout(r, 200)); return 1; };`,
      'nofn.js': `export const nothing = 1;`,
      'ok.js': `export default async () => ({ ok: true });`,
    });
    const boom = await post(`${url}/h/boom`);
    expect(boom.status).toBe(500);
    expect(((await boom.json()) as { detail: string }).detail).toContain('kaboom');
    expect((await post(`${url}/h/later`)).status).toBe(500); // an uncaught error stops that worker, not the engine
    const nofn = await post(`${url}/h/nofn`);
    expect(nofn.status).toBe(500);
    expect(((await nofn.json()) as { detail: string }).detail).toContain('default function');
    expect((await post(`${url}/h/ok`)).status).toBe(200);
    expect((await post(`${url}/h/boom`)).status).toBe(500);
  });

  it('running out of memory ends the request (500), not the engine', async () => {
    const { url } = await start({
      'hog.js': `export default async () => { const keep = []; while (true) keep.push(new Array(1e5).fill('x'.repeat(100))); };`,
      'ok.js': `export default async () => ({ ok: true });`,
    });
    const hog = await post(`${url}/h/hog`);
    expect([500, 504]).toContain(hog.status);
    expect((await post(`${url}/h/ok`)).status).toBe(200);
  }, 60_000);

  it('serves several requests at once, more than there are workers', async () => {
    const { url } = await start({ 'slowish.js': `export default async (ctx) => { await new Promise((r) => setTimeout(r, 100)); return { n: ctx.req.body.n }; };` });
    const answers = await Promise.all(Array.from({ length: 10 }, (_, n) => post(`${url}/h/slowish`, { n }).then(json)));
    expect(answers.map((answer) => answer.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('where handlers may live', () => {
  it('refuses a file that resolves outside the handlers folder (a symbolic link), and a missing folder or file', async () => {
    const running = await serve(definition(['evil', 'missing']));
    const outside = join(running.dir, 'secret.js');
    writeFileSync(outside, `export default async () => ({ leaked: true });`);
    mkdirSync(join(running.dir, 'handlers'));
    symlinkSync(outside, join(running.dir, 'handlers', 'evil.js'));
    const evil = await post(`${running.url}/h/evil`);
    expect(evil.status).toBe(500);
    expect(((await evil.json()) as { detail: string }).detail).toContain('outside the handlers folder');
    expect((await post(`${running.url}/h/missing`)).status).toBe(500);
  });

  it('refuses a handlers folder that does not exist', async () => {
    const { url } = await serve(definition(['nowhere']));
    expect(await json(await post(`${url}/h/nowhere`))).toMatchObject({ status: 500, detail: 'There is no handlers folder in the backend.' });
  });

  it('never accepts a path outside handlers/ in backend.json', async () => {
    for (const file of ['../etc/passwd.js', 'handlers/../../x.js', '/abs/path.js', 'other/x.js', 'handlers/x.txt', 'handlers//x.js', 'handlers/.hidden/../x.js']) {
      await expect(serve({ name: 'bad', endpoints: [{ id: 'h', type: 'handler', method: 'GET', path: '/h', file }] }), file).rejects.toThrow(/handler file looks like/);
    }
  });

  it('caps timeoutMs at 30000 and defaults it to 5000', async () => {
    await expect(serve({ name: 'bad', endpoints: [{ id: 'h', type: 'handler', method: 'GET', path: '/h', file: 'handlers/h.js', timeoutMs: 30_001 }] })).rejects.toThrow();
    const { backend } = await serve({ name: 'ok', endpoints: [{ id: 'h', type: 'handler', method: 'GET', path: '/h', file: 'handlers/h.js' }] });
    const found = backend.engine.definition.endpoints[0];
    expect(found?.type === 'handler' ? found.timeoutMs : undefined).toBe(5000);
  });
});

describe('hot reload', () => {
  it('runs the new code after the file is edited, without restarting', async () => {
    const { url, dir } = await start({ 'live.js': `export default async () => ({ version: 1 });` });
    expect(await json(await post(`${url}/h/live`))).toEqual({ version: 1 });
    write(dir, 'live.js', `export default async () => ({ version: 2, longer: true });`);
    await new Promise((done) => setTimeout(done, 300));
    expect(await json(await post(`${url}/h/live`))).toEqual({ version: 2, longer: true });
  });

  it('also reloads a helper module the handler imports', async () => {
    const { url, dir } = await start({
      'main.js': `import { value } from './lib/helper.js'; export default async () => ({ value });`,
      'lib/helper.js': `export const value = 'one';`,
    });
    expect(await json(await post(`${url}/h/main`))).toEqual({ value: 'one' });
    write(dir, 'lib/helper.js', `export const value = 'two-and-more';`);
    await new Promise((done) => setTimeout(done, 400));
    expect(await json(await post(`${url}/h/main`))).toEqual({ value: 'two-and-more' });
  });
});

describe('ctx.log and ctx.media', () => {
  it('writes to engine.log with secrets in the fields redacted', async () => {
    const { url, dir } = await start({ 'logs.js': `export default async (ctx) => { ctx.log.info('hello from handler', { password: 'hunter2', note: 'visible' }); console.log('console says hi'); await new Promise((r) => setTimeout(r, 100)); return 1; };` });
    expect((await post(`${url}/h/logs`)).status).toBe(200);
    await new Promise((done) => setTimeout(done, 100));
    const log = readFileSync(join(dir, '.data/logs/engine.log'), 'utf8');
    expect(log).toContain('hello from handler');
    expect(log).toContain('visible');
    expect(log).not.toContain('hunter2');
    expect(log).toContain('console says hi');
  });

  it('reads media metadata and URLs through the main thread', async () => {
    const running = await start(
      { 'media.js': `export default async (ctx) => ({ meta: await ctx.media.get(ctx.req.body.id), url: await ctx.media.url(ctx.req.body.id), none: await ctx.media.get('f'.repeat(32)) });` },
      {},
    );
    const form = new FormData();
    form.append('file', new Blob(['hello']), 'hello.txt');
    // Upload through the admin API of the running backend, then ask the handler about it.
    const uploaded = (await (await fetch(`http://127.0.0.1:${running.backend.admin.port}/__admin/media`, { method: 'POST', body: form, headers: { authorization: `Bearer ${running.backend.admin.token}` } })).json()) as { id: string };
    const answer = await json(await post(`${running.url}/h/media`, { id: uploaded.id }));
    expect(answer.meta).toMatchObject({ id: uploaded.id, name: 'hello.txt', mime: 'text/plain', size: 5 });
    expect(answer.url).toBe(`${running.url}/media/${uploaded.id}`);
    expect(answer.none).toBeNull();
  });
});
