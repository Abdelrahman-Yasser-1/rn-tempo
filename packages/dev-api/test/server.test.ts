import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, defineEndpoint, resource } from '@rn-tempo/api-contract';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createLogger, createServer, type DevServer } from '../src/index.ts';

const Product = z.object({ id: z.number().int(), title: z.string(), price: z.number() });

const products = resource('products', Product, { seed: 5, searchBy: ['title'] });
const randomItem = defineEndpoint({
  method: 'GET',
  path: '/random/:n',
  params: z.object({ n: z.coerce.number().int().min(1) }),
  response: z.object({ n: z.number(), email: z.email(), createdAt: z.iso.datetime() }),
  scenarios: { teapot: { status: 418, body: { message: 'I am a teapot' } }, slow: { delayMs: 30 } },
});
const search = defineEndpoint({
  method: 'POST',
  path: '/echo',
  body: z.object({ name: z.string().min(2), age: z.number().int() }),
  response: z.object({ name: z.string() }),
  data: ({ body }) => ({ name: body.name }),
});
const broken = defineEndpoint({
  method: 'GET',
  path: '/broken',
  response: z.object({ id: z.number() }),
  // The cast stands in for a user whose data function is wrong at runtime.
  data: () => ({ id: 'not a number' }) as unknown as { id: number },
});
const secret = defineEndpoint({
  method: 'GET',
  path: '/secret',
  auth: 'bearer',
  response: z.object({ ok: z.boolean() }),
  data: () => ({ ok: true }),
});
const secretWrite = defineEndpoint({
  method: 'POST',
  path: '/secret',
  auth: 'bearer',
  body: z.object({ name: z.string().min(1) }),
  response: z.object({ ok: z.boolean() }),
  data: () => ({ ok: true }),
});

const config = defineConfig({ endpoints: [products, randomItem, search, broken, secret, secretWrite], seed: 3, auth: true });

let dir: string;
let server: DevServer;
const silent = createLogger({ level: 'silent' });
const open = (): DevServer => createServer(config, { dataDir: dir, logger: silent, controlToken: 'ctl' });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tempo-api-'));
  server = open();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('validation', () => {
  it('answers 400 problem+json that names the fields', async () => {
    const res = await request(server.app).post('/echo').send({ name: 'x', age: 'old' });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({ type: 'about:blank', title: 'Invalid request', status: 400 });
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['body.age', 'body.name']);
  });

  it('validates params and query', async () => {
    const res = await request(server.app).get('/random/0');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('params.n');
    expect((await request(server.app).get('/products?limit=abc')).body.errors[0].path).toBe('query.limit');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(server.app).post('/echo').set('content-type', 'application/json').send('{ nope');
    expect(res.status).toBe(400);
  });

  it('uses the validated body in data', async () => {
    const res = await request(server.app).post('/echo').send({ name: 'Ada', age: 36 });
    expect(res.body).toEqual({ name: 'Ada' });
  });
});

describe('generated data', () => {
  it('is deterministic and matches the schema', async () => {
    const a = await request(server.app).get('/random/4');
    const b = await request(server.app).get('/random/4');
    const c = await request(server.app).get('/random/5');
    expect(a.status).toBe(200);
    expect(a.body).toEqual(b.body);
    expect(c.body).not.toEqual(a.body);
    expect(a.headers['x-tempo-dev-api']).toBeDefined();
  });

  it('prefers a fixture file over generation', async () => {
    writeFileSync(join(dir, 'get.random.:n.json'), JSON.stringify({ n: 1, email: 'a@b.co', createdAt: '2020-01-01T00:00:00Z' }));
    const withFixture = createServer(config, { dataDir: dir, fixturesDir: dir, logger: silent });
    const res = await request(withFixture.app).get('/random/9');
    expect(res.body.email).toBe('a@b.co');
  });
});

describe('scenarios', () => {
  it('picks one by header', async () => {
    const res = await request(server.app).get('/random/1').set('x-tempo-scenario', 'teapot');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ message: 'I am a teapot' });
  });

  it('has built-in scenarios on every endpoint', async () => {
    const res = await request(server.app).get('/random/1').set('x-tempo-scenario', 'notFound');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/problem\+json/);
    expect((await request(server.app).get('/random/1').set('x-tempo-scenario', 'serverError')).status).toBe(500);
  });

  it('delays with delayMs and then answers normally', async () => {
    const started = Date.now();
    const res = await request(server.app).get('/random/1').set('x-tempo-scenario', 'slow');
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  it('rejects an unknown scenario in the header', async () => {
    const res = await request(server.app).get('/random/1').set('x-tempo-scenario', 'nope');
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/Available: .*teapot/);
  });

  it('uses the scenario set in the store, and the header wins over it', async () => {
    server.store.setScenario('get.random.:n', 'notFound');
    expect((await request(server.app).get('/random/1')).status).toBe(404);
    expect((await request(server.app).get('/random/1').set('x-tempo-scenario', 'teapot')).status).toBe(418);
    server.store.clearScenario();
    expect((await request(server.app).get('/random/1')).status).toBe(200);
  });

  it('is set through the control route only with the token', async () => {
    const body = { endpointId: 'get.random.:n', name: 'notFound' };
    expect((await request(server.app).post('/__tempo/scenario').send(body)).status).toBe(401);
    expect((await request(server.app).post('/__tempo/scenario').set('x-tempo-token', 'wrong').send(body)).status).toBe(401);
    expect((await request(server.app).post('/__tempo/scenario').set('x-tempo-token', 'ctl').send(body)).status).toBe(200);
    expect((await request(server.app).get('/random/1')).status).toBe(404);
    await request(server.app).post('/__tempo/scenario').set('x-tempo-token', 'ctl').send({ clear: true });
    expect((await request(server.app).get('/random/1')).status).toBe(200);
  });
});

describe('resource CRUD', () => {
  it('lists with dummyjson paging and search', async () => {
    const res = await request(server.app).get('/products?limit=2&skip=1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, skip: 1, limit: 2 });
    expect(res.body.products.map((p: { id: number }) => p.id)).toEqual([2, 3]);
    const title = res.body.products[0].title as string;
    const found = await request(server.app).get('/products').query({ q: title.slice(0, 6) });
    expect(found.body.products.map((p: { title: string }) => p.title)).toContain(title);
  });

  it('gets, creates, updates and deletes', async () => {
    expect((await request(server.app).get('/products/2')).body.id).toBe(2);
    expect((await request(server.app).get('/products/99')).status).toBe(404);

    const created = await request(server.app).post('/products/add').send({ title: 'New', price: 9 });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 6, title: 'New', price: 9 });

    const updated = await request(server.app).patch('/products/6').send({ price: 12 });
    expect(updated.body).toEqual({ id: 6, title: 'New', price: 12 });

    const removed = await request(server.app).delete('/products/6');
    expect(removed.body.id).toBe(6);
    expect((await request(server.app).get('/products/6')).status).toBe(404);
    expect((await request(server.app).get('/products')).body.total).toBe(5);
  });

  it('rejects a bad create body', async () => {
    const res = await request(server.app).post('/products/add').send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('body.price');
  });

  it('persists across a restart', async () => {
    await request(server.app).post('/products/add').send({ title: 'Kept', price: 1 });
    const before = (await request(server.app).get('/products?limit=0')).body;
    const restarted = open();
    const after = (await request(restarted.app).get('/products?limit=0')).body;
    expect(after).toEqual(before);
    expect(after.total).toBe(6);
    expect(JSON.parse(readFileSync(join(dir, 'db.json'), 'utf8')).collections.products).toHaveLength(6);
  });

  it('seeds the same data for the same seed', async () => {
    const other = mkdtempSync(join(tmpdir(), 'tempo-api-'));
    try {
      const twin = createServer(config, { dataDir: other, logger: silent });
      const a = (await request(server.app).get('/products?limit=0')).body;
      const b = (await request(twin.app).get('/products?limit=0')).body;
      expect(a).toEqual(b);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('resets back to the seed through the store and the control route', async () => {
    const original = (await request(server.app).get('/products?limit=0')).body;
    await request(server.app).post('/products/add').send({ title: 'Temp', price: 1 });
    await request(server.app).delete('/products/1');
    server.store.reset();
    expect((await request(server.app).get('/products?limit=0')).body).toEqual(original);

    await request(server.app).delete('/products/2');
    expect((await request(server.app).post('/__tempo/reset')).status).toBe(401);
    expect((await request(server.app).post('/__tempo/reset').set('x-tempo-token', 'ctl')).status).toBe(200);
    expect((await request(server.app).get('/products?limit=0')).body).toEqual(original);
  });

  it('moves aside a corrupt db.json instead of crashing', async () => {
    await request(server.app).get('/products');
    writeFileSync(join(dir, 'db.json'), '{ broken');
    const recovered = open();
    expect((await request(recovered.app).get('/products')).body.total).toBe(5);
  });
});

describe('mock auth', () => {
  const login = (body: object) => request(server.app).post('/auth/login').send(body);

  it('answers 401 without a token and 200 with one', async () => {
    expect((await request(server.app).get('/secret')).status).toBe(401);
    expect((await request(server.app).get('/secret').set('authorization', 'Bearer nope')).status).toBe(401);
    const { body } = await login({ username: 'emilys', password: 'emilyspass' });
    const res = await request(server.app).get('/secret').set('authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
  });

  it('checks the token before the body, so an anonymous caller learns nothing about the shape', async () => {
    const anonymous = await request(server.app).post('/secret').send({ wrong: true });
    expect(anonymous.status).toBe(401);
    expect(JSON.stringify(anonymous.body)).not.toContain('name');
    const { body } = await login({ username: 'emilys', password: 'emilyspass' });
    const invalid = await request(server.app)
      .post('/secret')
      .set('authorization', `Bearer ${body.accessToken}`)
      .send({ wrong: true });
    expect(invalid.status).toBe(400);
  });

  it('logs in with the C13 shape and opaque tokens', async () => {
    const res = await login({ username: 'emilys', password: 'emilyspass' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, username: 'emilys', firstName: 'Emily' });
    expect(res.body.accessToken).not.toContain('.');
    expect(res.body.accessToken).toMatch(/^tempo_dev_access_/);
  });

  it('rejects bad credentials', async () => {
    const res = await login({ username: 'emilys', password: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('serves /auth/me and rotates refresh tokens', async () => {
    const { body } = await login({ username: 'emilys', password: 'emilyspass' });
    const me = await request(server.app).get('/auth/me').set('authorization', `Bearer ${body.accessToken}`);
    expect(me.body.username).toBe('emilys');

    const refreshed = await request(server.app).post('/auth/refresh').send({ refreshToken: body.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(body.refreshToken);
    // The old refresh token is spent.
    expect((await request(server.app).post('/auth/refresh').send({ refreshToken: body.refreshToken })).status).toBe(401);
  });

  it('keeps tokens valid across a restart', async () => {
    const { body } = await login({ username: 'emilys', password: 'emilyspass' });
    const restarted = open();
    const res = await request(restarted.app).get('/auth/me').set('authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
  });

  it('is off unless config.auth is set', async () => {
    const plain = createServer(defineConfig({ endpoints: [randomItem] }), { dataDir: dir, logger: silent });
    expect((await request(plain.app).post('/auth/login').send({})).status).toBe(404);
  });
});

describe('response schema check', () => {
  it('answers 500 problem+json instead of sending invalid data', async () => {
    const res = await request(server.app).get('/broken');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ title: 'Response does not match its schema', status: 500 });
    expect(res.body.detail).toMatch(/get\.broken/);
    expect(res.body.errors[0].path).toBe('response.id');
    expect(res.body.id).toBeUndefined();
  });

  it('reports a throwing data function', async () => {
    const boom = defineEndpoint({
      method: 'GET',
      path: '/boom',
      response: z.object({}),
      data: () => {
        throw new Error('kaput');
      },
    });
    const app = createServer(defineConfig({ endpoints: [boom] }), { dataDir: dir, logger: silent }).app;
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.detail).toMatch(/kaput/);
  });
});

describe('internal routes', () => {
  it('serves health and the endpoint list', async () => {
    const health = await request(server.app).get('/__tempo/health');
    expect(health.body).toMatchObject({ ok: true, service: 'tempo-dev-api' });
    const list = await request(server.app).get('/__tempo/endpoints');
    expect(Array.isArray(list.body)).toBe(true);
    const ids = list.body.map((e: { id: string }) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['list.products', 'get.random.:n', 'post.auth.login', 'get.auth.me']));
    const entry = list.body.find((e: { id: string }) => e.id === 'get.random.:n');
    expect(entry.scenarios).toEqual(expect.arrayContaining(['teapot', 'notFound']));
  });

  it('answers 404 problem+json for unknown routes', async () => {
    const res = await request(server.app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/problem\+json/);
  });

  it('mounts endpoints under basePath', async () => {
    const mounted = createServer(defineConfig({ endpoints: [randomItem], basePath: '/api/v1' }), { dataDir: dir, logger: silent });
    expect((await request(mounted.app).get('/api/v1/random/1')).status).toBe(200);
    expect((await request(mounted.app).get('/random/1')).status).toBe(404);
    const list = await request(mounted.app).get('/__tempo/endpoints');
    expect(list.body[0].path).toBe('/api/v1/random/:n');
  });

  it('tries static paths before parameter paths', async () => {
    const Item = z.object({ kind: z.string() });
    const byId = defineEndpoint({ method: 'GET', path: '/things/:id', response: Item, data: () => ({ kind: 'by-id' }) });
    const special = defineEndpoint({ method: 'GET', path: '/things/search', response: Item, data: () => ({ kind: 'search' }) });
    const app = createServer(defineConfig({ endpoints: [byId, special] }), { dataDir: dir, logger: silent }).app;
    expect((await request(app).get('/things/search')).body.kind).toBe('search');
    expect((await request(app).get('/things/7')).body.kind).toBe('by-id');
  });
});

describe('logging', () => {
  it('redacts secrets and personal data in headers, bodies and queries', async () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', destination: { write: (chunk: string) => void lines.push(chunk) } });
    const app = createServer(config, { dataDir: dir, logger }).app;

    const login = await request(app)
      .post('/auth/login?token=urlsecret')
      .set('authorization', 'Bearer headersecret')
      .set('cookie', 'sid=cookiesecret')
      .send({ username: 'emilys', password: 'emilyspass' });
    await request(app).post('/echo').send({ name: 'Ada', age: 36, email: 'ada@example.com', phone: '+15551234567', otp: '123456', nested: { code: '998877', refreshToken: 'rt-secret' } });

    const log = lines.join('');
    expect(log).toContain('request detail');
    for (const secret of [
      'emilyspass',
      'headersecret',
      'cookiesecret',
      'urlsecret',
      login.body.accessToken,
      login.body.refreshToken,
      'emily.johnson@x.dummyjson.com',
      'ada@example.com',
      '+15551234567',
      '123456',
      '998877',
      'rt-secret',
    ]) {
      expect(log, `leaked ${secret}`).not.toContain(secret);
    }
    expect(log).toContain('[REDACTED]');
    // Harmless fields stay readable.
    expect(log).toContain('"username":"emilys"');
  });
});
