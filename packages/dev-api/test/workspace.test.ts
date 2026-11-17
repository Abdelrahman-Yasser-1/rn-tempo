import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/cli/config.ts';
import { resolvePaths } from '../src/cli/paths.ts';
import { createLogger, createServer } from '../src/index.ts';
import { exportCode, fileNameFor, writeExport } from '../src/workspace/export.ts';
import { workspaceToConfig } from '../src/workspace/load.ts';
import { importOpenApi, parseOpenApiText } from '../src/workspace/openapi-import.ts';
import { parseWorkspace, workspaceJsonSchema, type Workspace } from '../src/workspace/schema.ts';
import { zodSource } from '../src/workspace/zod-source.ts';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const silent = createLogger({ level: 'silent' });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tempo-ws-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const product = {
  type: 'object',
  properties: { id: { type: 'integer' }, title: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }, note: { type: ['string', 'null'] } },
  required: ['id', 'title'],
  additionalProperties: false,
};

const workspace: Workspace = {
  name: 'shop',
  seed: 7,
  endpoints: [
    {
      id: 'get.products',
      method: 'GET',
      path: '/products',
      tags: ['products'],
      request: { query: { type: 'object', properties: { limit: { type: 'integer', minimum: 1 }, all: { type: 'boolean' } } } },
      response: { status: 200, schema: { type: 'object', properties: { items: { type: 'array', items: product } }, required: ['items'] } },
    },
    {
      id: 'get.products.:id',
      method: 'GET',
      path: '/products/:id',
      tags: ['products'],
      summary: 'One product',
      request: { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
      response: { status: 200, schema: product, example: { id: 1, title: 'Fixed', note: null } },
      scenarios: { gone: { status: 410, body: { message: 'gone' } }, slow: { delayMs: 5 } },
    },
    {
      id: 'post.products',
      method: 'POST',
      path: '/products',
      tags: ['products'],
      request: { body: { type: 'object', properties: { title: { type: 'string', minLength: 2 } }, required: ['title'] } },
      response: { status: 201, schema: product },
    },
    { id: 'delete.products.:id', method: 'DELETE', path: '/products/:id', tags: ['products'], response: { status: 204 } },
    { id: 'get.me', method: 'GET', path: '/me', auth: 'bearer', response: { status: 200, example: { name: 'Emily' } } },
    { id: 'get.ping', method: 'GET', path: '/ping', response: { status: 200 } },
    { id: 'get.bad', method: 'GET', path: '/bad', response: { status: 200, schema: product, example: { id: 'nope' } } },
  ],
};

describe('workspace format', () => {
  it('keeps schemas/tempo-api.schema.json in sync with the Zod schema', () => {
    const file = join(here, '../schemas/tempo-api.schema.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(workspaceJsonSchema());
  });

  it('validates a workspace and names every problem by path', () => {
    expect(parseWorkspace(workspace, 'w.json').name).toBe('shop');
    expect(() => parseWorkspace({ name: 'x', endpoints: [{ id: 'a', method: 'GET', path: 'no-slash', response: { status: 200 } }], extra: 1 }, 'w.json')).toThrow(
      /endpoints\.0\.path[\s\S]*extra/,
    );
  });
});

describe('workspace loader', () => {
  const open = (ws: Workspace) => {
    const { config, warnings } = workspaceToConfig(ws);
    return { server: createServer(config, { dataDir: dir, logger: silent, controlToken: 't' }), warnings };
  };

  it('serves examples, generated data, coerced params and queries, validation, scenarios and 204', async () => {
    const { server } = open(workspace);
    const one = await request(server.app).get('/products/1');
    expect(one.body).toEqual({ id: 1, title: 'Fixed', note: null });
    expect((await request(server.app).get('/products/abc')).status).toBe(400);

    const list = await request(server.app).get('/products?limit=2&all=true');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);
    // Generated from the JSON Schema, stable for the seed, and valid for it.
    expect((await request(server.app).get('/products?limit=2')).body).toEqual((await request(server.app).get('/products?limit=2')).body);
    expect((await request(server.app).get('/products?limit=0')).status).toBe(400);

    expect((await request(server.app).post('/products').send({ title: 'x' })).status).toBe(400);
    const created = await request(server.app).post('/products').send({ title: 'ok' });
    expect(created.status).toBe(201);
    expect(typeof created.body.title).toBe('string');

    expect((await request(server.app).delete('/products/1')).status).toBe(204);
    expect((await request(server.app).get('/ping')).body).toEqual({});

    const gone = await request(server.app).get('/products/1').set('x-tempo-scenario', 'gone');
    expect(gone.status).toBe(410);
    expect(gone.body).toEqual({ message: 'gone' });
  });

  it('turns on the mock login for bearer endpoints, so a token can be had', async () => {
    const { server } = open(workspace);
    expect((await request(server.app).get('/me')).status).toBe(401);
    const login = await request(server.app).post('/auth/login').send({ username: 'emilys', password: 'emilyspass' });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;
    expect((await request(server.app).get('/me').set('authorization', `Bearer ${token}`)).body).toEqual({ name: 'Emily' });
  });

  it('drops an example that fails its schema, with a warning, and generates data instead', async () => {
    const { server, warnings } = open(workspace);
    expect(warnings.join('\n')).toMatch(/get\.bad: the example does not match/);
    const res = await request(server.app).get('/bad');
    expect(res.status).toBe(200);
    expect(typeof res.body.id).toBe('number');
  });

  it('is picked by a .json config path, and by tempo-api.json when there is no TypeScript config', async () => {
    writeFileSync(join(dir, 'tempo-api.json'), JSON.stringify(workspace));
    const byDefault = resolvePaths(dir, undefined);
    expect(byDefault.config).toBe(join(dir, 'tempo-api.json'));
    expect((await loadConfig(byDefault.config)).endpoints).toHaveLength(workspace.endpoints.length);
    mkdirSync(join(dir, 'api'));
    writeFileSync(join(dir, 'api/tempo-api.config.ts'), 'export default {}');
    expect(resolvePaths(dir, undefined).config).toBe(join(dir, 'api/tempo-api.config.ts'));
    expect(resolvePaths(dir, 'tempo-api.json').config).toBe(join(dir, 'tempo-api.json'));
  });

  it('reports an invalid file readably', async () => {
    writeFileSync(join(dir, 'tempo-api.json'), '{ "name": "x", "endpoints": [{}] }');
    await expect(loadConfig(join(dir, 'tempo-api.json'))).rejects.toThrow(/not a valid tempo-api workspace[\s\S]*endpoints\.0/);
    writeFileSync(join(dir, 'broken.json'), '{ nope');
    await expect(loadConfig(join(dir, 'broken.json'))).rejects.toThrow(/not valid JSON/);
  });
});

describe('OpenAPI import', () => {
  const doc30 = {
    openapi: '3.0.3',
    info: { title: 'Pets' },
    servers: [{ url: 'https://example.com/api/v1' }],
    security: [{ bearerAuth: [] }],
    paths: {
      '/pets/{petId}': {
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' } }],
        get: {
          summary: 'Get a pet',
          tags: ['pets'],
          parameters: [{ name: 'verbose', in: 'query', schema: { type: 'boolean' } }],
          responses: {
            '404': { description: 'no' },
            '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' }, example: { id: 1, name: 'Rex', owner: null } } } },
          },
        },
        delete: { responses: { '204': { description: 'gone' } }, security: [] },
      },
      '/pets': {
        post: {
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
          responses: { '201': { description: 'made', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
        },
        head: { responses: { '200': { description: 'x' } } },
      },
    },
    components: {
      schemas: {
        Pet: {
          type: 'object',
          required: ['id', 'name'],
          properties: { id: { type: 'integer' }, name: { type: 'string' }, owner: { type: 'string', nullable: true }, parent: { $ref: '#/components/schemas/Pet' } },
        },
      },
    },
  };

  it('maps paths, parameters, bodies, security, refs, nullable and the first 2xx', () => {
    const { workspace: ws, warnings } = importOpenApi(doc30);
    expect(ws).toMatchObject({ name: 'Pets', basePath: '/api/v1' });
    const get = ws.endpoints.find((e) => e.id === 'get.pets.:petId');
    expect(get).toMatchObject({ method: 'GET', path: '/pets/:petId', summary: 'Get a pet', tags: ['pets'], auth: 'bearer' });
    expect(get?.request?.params).toEqual({ type: 'object', properties: { petId: { type: 'integer' } }, required: ['petId'] });
    expect(get?.request?.query).toEqual({ type: 'object', properties: { verbose: { type: 'boolean' } } });
    expect(get?.response.status).toBe(200);
    expect(get?.response.example).toEqual({ id: 1, name: 'Rex', owner: null });
    const schema = get?.response.schema as { properties: Record<string, Record<string, unknown>> };
    expect(schema.properties.owner).toEqual({ type: ['string', 'null'] });
    // A schema that contains itself is cut to "any" where it repeats.
    expect(schema.properties.parent).toEqual({});
    expect(ws.endpoints.find((e) => e.id === 'delete.pets.:petId')).toMatchObject({ response: { status: 204 } });
    expect(ws.endpoints.find((e) => e.id === 'delete.pets.:petId')?.auth).toBeUndefined();
    expect(ws.endpoints.find((e) => e.id === 'post.pets')?.request?.body).toBeDefined();
    expect(warnings.join('\n')).toMatch(/HEAD \/pets is not supported/);
    expect(warnings.join('\n')).toMatch(/recursive/);
  });

  it('serves what it imported', async () => {
    const { workspace: ws } = importOpenApi(doc30);
    const { config } = workspaceToConfig(ws);
    const server = createServer(config, { dataDir: dir, logger: silent, controlToken: 't' });
    const login = await request(server.app).post('/api/v1/auth/login').send({ username: 'emilys', password: 'emilyspass' });
    const auth = { authorization: `Bearer ${login.body.accessToken as string}` };
    expect((await request(server.app).get('/api/v1/pets/1').set(auth)).body).toEqual({ id: 1, name: 'Rex', owner: null });
    expect((await request(server.app).get('/api/v1/pets/x').set(auth)).status).toBe(400);
    expect((await request(server.app).delete('/api/v1/pets/1')).status).toBe(204);
  });

  it('reads YAML, and rejects Swagger 2 and other formats', () => {
    const yaml = 'openapi: 3.1.0\ninfo:\n  title: Y\npaths:\n  /a:\n    get:\n      responses:\n        "200":\n          description: ok\n          content:\n            application/json:\n              schema:\n                type: object\n';
    expect(importOpenApi(parseOpenApiText(yaml, 'api.yaml')).workspace.endpoints).toHaveLength(1);
    expect(importOpenApi(parseOpenApiText(yaml, 'api.json')).workspace.name).toBe('Y');
    expect(() => importOpenApi({ swagger: '2.0' })).toThrow(/Swagger 2.0/);
    expect(() => importOpenApi({ openapi: '4.0.0' })).toThrow(/not supported/);
    expect(() => parseOpenApiText('a: [', 'x.yaml')).toThrow(/neither valid JSON nor valid YAML/);
  });

  it('re-imports the template openapi.json into a workspace that serves every endpoint', async () => {
    const text = readFileSync(join(repo, 'template/api/generated/openapi.json'), 'utf8');
    const { workspace: ws } = importOpenApi(parseOpenApiText(text, 'openapi.json'));
    expect(ws.endpoints.length).toBe(13);
    const { config } = workspaceToConfig(parseWorkspace(JSON.parse(JSON.stringify(ws)), 'imported'));
    const server = createServer(config, { dataDir: dir, logger: silent, controlToken: 't' });
    expect((await request(server.app).get('/products/3')).status).toBe(200);
    expect((await request(server.app).get('/products?limit=2&skip=1')).status).toBe(200);
    expect((await request(server.app).get('/products/search?q=a')).status).toBe(200);
    expect((await request(server.app).get('/app-config')).status).toBe(200);
    expect((await request(server.app).post('/auth/login').send({ username: 'emilys', password: 'emilyspass' })).status).toBe(200);
    // Request validation came across too.
    expect((await request(server.app).get('/products?limit=-1')).status).toBe(400);
    for (const endpoint of server.endpoints.filter((e) => e.method === 'GET' && !e.path.includes(':'))) {
      expect((await request(server.app).get(endpoint.path).set('authorization', 'Bearer x')).status, endpoint.id).not.toBe(500);
    }
  });
});

describe('zod source', () => {
  it('writes the supported subset', () => {
    expect(zodSource({ type: 'string', format: 'email', minLength: 3 })).toBe('z.email().min(3)');
    expect(zodSource({ type: ['integer', 'null'], minimum: 0 })).toBe('z.number().int().min(0).nullable()');
    expect(zodSource({ enum: ['a', 'b'] })).toBe("z.enum(['a', 'b'])");
    expect(zodSource({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe('z.string().nullable()');
    expect(zodSource({ type: 'array', items: { type: 'boolean' } })).toBe('z.array(z.boolean())');
    expect(zodSource({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false })).toBe('z.strictObject({\n  a: z.string(),\n})');
    expect(zodSource({ type: 'integer' }, { text: true })).toBe('z.coerce.number().int()');
    expect(zodSource({ not: 'supported' })).toBe('z.unknown()');
  });
});

describe('export code', () => {
  it('names files by the first tag, and refuses to overwrite without --force', () => {
    expect(fileNameFor(['app config'])).toBe('appConfig');
    expect(fileNameFor(undefined)).toBe('default');
    const { files } = exportCode(workspace);
    expect(Object.keys(files).sort()).toEqual(['api/endpoints/default.ts', 'api/endpoints/products.ts', 'api/tempo-api.config.ts']);
    writeExport(dir, files, false);
    expect(() => writeExport(dir, files, false)).toThrow(/already exist[\s\S]*--force/);
    writeFileSync(join(dir, 'api/tempo-api.config.ts'), '// mine');
    writeExport(dir, files, true);
    expect(readFileSync(join(dir, 'api/tempo-api.config.ts'), 'utf8')).toContain('defineConfig');
  });

  it('writes nothing when any one target exists', () => {
    const { files } = exportCode(workspace);
    mkdirSync(join(dir, 'api/endpoints'), { recursive: true });
    writeFileSync(join(dir, 'api/endpoints/products.ts'), '// mine');
    expect(() => writeExport(dir, files, false)).toThrow(/already exist/);
    expect(existsSync(join(dir, 'api/tempo-api.config.ts'))).toBe(false);
  });

  it('exports a project that tempo-api check accepts and tsc compiles', { timeout: 120_000 }, async () => {
    writeFileSync(join(dir, 'tempo-api.json'), JSON.stringify(workspace));
    symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'), 'dir');
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        extends: '@rn-tempo/tsconfig/base.json',
        compilerOptions: { target: 'ES2023', lib: ['ES2023'], module: 'ESNext', moduleResolution: 'Bundler', types: ['node'], noEmit: true, allowImportingTsExtensions: true, skipLibCheck: true },
        include: ['api/tempo-api.config.ts', 'api/endpoints'],
      }),
    );
    const bin = join(here, '../src/bin.ts');
    const cli = (...args: string[]) => run(process.execPath, [bin, ...args, '--cwd', dir], { cwd: dir });

    const exported = await cli('export', 'code');
    expect(exported.stdout).toContain('api/tempo-api.config.ts');
    await expect(cli('export', 'code')).rejects.toMatchObject({ stderr: expect.stringContaining('--force') });
    await cli('export', 'code', '--force');

    // The exported config loads, generates, and the generated files are up to date.
    await cli('generate');
    expect((await cli('check')).stdout).toContain('up to date');
    const tsc = await run(process.execPath, [join(repo, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', dir], { cwd: dir }).catch((error: { stdout?: string }) => {
      throw new Error(`tsc failed:\n${error.stdout ?? ''}`);
    });
    expect(tsc.stderr).toBe('');
    const products = readFileSync(join(dir, 'api/endpoints/products.ts'), 'utf8');
    expect(products).toContain('z.coerce.number()');
    expect(products).toContain('scenarios');
  });

  it('imports through the CLI and refuses to overwrite its output', async () => {
    const bin = join(here, '../src/bin.ts');
    const source = join(repo, 'template/api/generated/openapi.json');
    const cli = (...args: string[]) => run(process.execPath, [bin, ...args, '--cwd', dir], { cwd: dir });
    expect((await cli('import', 'openapi', source)).stdout).toContain('Imported 13 endpoints');
    await expect(cli('import', 'openapi', source)).rejects.toMatchObject({ stderr: expect.stringContaining('--force') });
    await cli('import', 'openapi', source, '--out', 'other.json');
    expect(existsSync(join(dir, 'other.json'))).toBe(true);
  });
});

describe('importOpenApi expansion budget', () => {
  it('rejects a document whose $refs fan out exponentially', () => {
    // Each level references the next one 10 times: 10^8 nodes if expanded naively.
    const schemas: Record<string, unknown> = { L8: { type: 'string' } };
    for (let level = 0; level < 8; level += 1) {
      const properties: Record<string, unknown> = {};
      for (let i = 0; i < 10; i += 1) properties[`p${i}`] = { $ref: `#/components/schemas/L${level + 1}` };
      schemas[`L${level}`] = { type: 'object', properties };
    }
    const doc = {
      openapi: '3.1.0',
      info: { title: 'fan-out', version: '1' },
      components: { schemas },
      paths: {
        '/boom': {
          get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/L0' } } } } } },
        },
      },
    };
    expect(() => importOpenApi(doc)).toThrow(/expands to more than/);
  });
});
