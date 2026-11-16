import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, defineEndpoint, resource } from '@rn-tempo/api-contract';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildOpenApi, maskSecrets, openApiText } from '../src/docs/openapi.ts';
import { allFiles, mswFiles } from '../src/docs/outputs.ts';
import { buildPostmanCollection, buildPostmanEnvironment } from '../src/docs/postman.ts';
import { createLogger, createServer } from '../src/index.ts';

const Product = z.object({ id: z.number().int(), title: z.string(), price: z.number(), created: z.date().optional() });
const login = defineEndpoint({
  method: 'POST',
  path: '/auth/login',
  summary: 'Sign in',
  tags: ['auth'],
  body: z.object({ username: z.string(), password: z.string() }),
  response: z.object({ accessToken: z.string(), id: z.number().int() }),
  data: () => ({ accessToken: 't', id: 1 }),
  scenarios: { locked: { status: 423 }, teapot: { status: 418, body: { message: 'teapot' } } },
});
const me = defineEndpoint({
  method: 'GET',
  path: '/users/:id',
  tags: ['users'],
  auth: 'bearer',
  params: z.object({ id: z.coerce.number().int() }),
  query: z.object({ verbose: z.coerce.boolean().optional() }),
  response: Product,
  data: () => ({ id: 1, title: 'x', price: 1 }),
});
const config = defineConfig({ endpoints: [login, me, resource('products', Product, { seed: 3 })], seed: 5, basePath: '/v1', port: 9000 });

describe('buildOpenApi', () => {
  const doc = buildOpenApi(config) as Record<string, any>;

  it('is an OpenAPI 3.1 document with sorted, stable output', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: '/v1' }]);
    expect(Object.keys(doc.paths)).toEqual([...Object.keys(doc.paths)].sort());
    expect(openApiText(config)).toBe(openApiText(config));
    expect(doc.tags).toEqual([{ name: 'auth' }, { name: 'products' }, { name: 'users' }]);
  });

  it('turns :params into {params} and describes parameters, bodies and security', () => {
    const op = doc.paths['/users/{id}'].get;
    expect(op.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      { name: 'verbose', in: 'query', required: false, schema: { type: 'boolean' } },
    ]);
    expect(op.security).toEqual([{ bearerAuth: [] }]);
    expect(op.responses['401']).toBeDefined();
    const post = doc.paths['/auth/login'].post;
    expect(post.requestBody.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/PostAuthLoginRequest' });
    expect(post.requestBody.content['application/json'].example).toEqual({ username: expect.any(String), password: expect.any(String) });
  });

  it('documents scenarios as responses and keeps a date as an open schema instead of failing', () => {
    const post = doc.paths['/auth/login'].post;
    expect(post.responses['423'].description).toContain('locked');
    expect(post.responses['418'].content['application/json'].example).toEqual({ message: 'teapot' });
    expect(doc.components.schemas.GetUsersIdResponse.properties.created).toBeDefined();
    expect(doc.components.schemas.Problem).toBeDefined();
  });

  it('includes the mock auth endpoints when auth is on', () => {
    const withAuth = buildOpenApi(defineConfig({ endpoints: [me], auth: true })) as Record<string, any>;
    expect(Object.keys(withAuth.paths)).toContain('/auth/login');
  });
});

describe('examples never look like credentials', () => {
  it('masks secret-looking fields at any depth', () => {
    expect(maskSecrets({ password: 'x8Hk2', user: { accessToken: 'abc', name: 'Ann' }, list: [{ otp: '1' }] })).toEqual({
      password: '<password>',
      user: { accessToken: '<accessToken>', name: 'Ann' },
      list: [{ otp: '<otp>' }],
    });
  });

  it('the login example holds a placeholder', () => {
    const body = (buildOpenApi(config) as Record<string, any>).paths['/auth/login'].post.requestBody.content['application/json'].example;
    expect(body.password).toBe('<password>');
  });
});

describe('postman', () => {
  const doc = buildOpenApi(config);
  const collection = buildPostmanCollection(doc, { baseUrl: 'http://localhost:9000' }) as Record<string, any>;

  it('builds a v2.1 collection with folders by tag and example bodies', () => {
    expect(collection.info.schema).toContain('v2.1.0');
    expect(collection.item.map((f: { name: string }) => f.name)).toEqual(['auth', 'products', 'users']);
    const signIn = collection.item[0].item[0];
    expect(signIn.name).toBe('Sign in');
    expect(signIn.request.url.raw).toBe('{{baseUrl}}/v1/auth/login');
    expect(JSON.parse(signIn.request.body.raw)).toHaveProperty('username');
    expect(signIn.event[0].script.exec.join('\n')).toContain("pm.environment.set('token'");
    const user = collection.item[2].item[0];
    expect(user.request.auth.bearer[0].value).toBe('{{token}}');
    expect(user.request.url.path).toEqual(['v1', 'users', ':id']);
  });

  it('is deterministic: no random ids', () => {
    expect(JSON.stringify(buildPostmanCollection(buildOpenApi(config), { baseUrl: 'http://localhost:9000' }))).toBe(JSON.stringify(collection));
  });

  it('has an environment with a base URL and an empty token', () => {
    expect(buildPostmanEnvironment({ baseUrl: 'http://localhost:9000' })).toMatchObject({
      values: [{ key: 'baseUrl', value: 'http://localhost:9000' }, { key: 'token', value: '' }],
    });
  });
});

describe('msw file', () => {
  it('imports the config relative to the output folder, without its extension', () => {
    const text = mswFiles('/p/api/tempo-api.config.ts', '/p/api/generated')['msw-handlers.ts'];
    expect(text).toContain("import config from '../tempo-api.config';");
    expect(text).toContain('toMswHandlers(config, { http, HttpResponse }, options)');
  });

  it('allFiles lists the four generated files', () => {
    expect(Object.keys(allFiles(config, '/p/api/c.ts', '/p/api/generated')).sort()).toEqual([
      'msw-handlers.ts',
      'openapi.json',
      'postman.collection.json',
      'postman.environment.json',
    ]);
  });
});

describe('Swagger UI', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tempo-docs-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('serves the page, the UI files and the document, and nothing else from the package', async () => {
    const server = createServer(config, { dataDir: dir, logger: createLogger({ level: 'silent' }) });
    const page = await request(server.app).get('/docs');
    expect([200, 301]).toContain(page.status);
    const html = await request(server.app).get('/docs/');
    expect(html.status).toBe(200);
    expect(html.text).toContain('swagger-ui-bundle.js');
    expect((await request(server.app).get('/docs/swagger-ui-bundle.js')).status).toBe(200);
    expect((await request(server.app).get('/docs/swagger-ui.css')).status).toBe(200);
    const initializer = await request(server.app).get('/docs/swagger-initializer.js');
    expect(initializer.text).toContain('/docs/openapi.json');
    expect(initializer.text).not.toContain('petstore');
    expect((await request(server.app).get('/docs/package.json')).status).toBe(404);
    const openapi = await request(server.app).get('/docs/openapi.json');
    expect(openapi.body.openapi).toBe('3.1.0');
  });
});
