import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import generateCommand from '../src/commands/generate.ts';
import { addNamedImport, generateEndpoint } from '../src/lib/endpoint.ts';
import { pathExists, walkFiles } from '../src/lib/fs-utils.ts';
import { generateFeature } from '../src/lib/scaffold.ts';
import { copyFixtureProject, makeTempDir } from './helpers.ts';

const BACKEND = `${JSON.stringify(
  {
    name: 'orders-app',
    port: 8443,
    auth: { seedUsers: [] },
    collections: [],
    endpoints: [{ id: 'app.hello', type: 'static', method: 'GET', path: '/hello', body: { hello: 'world' } }],
  },
  null,
  2,
)}\n`;

describe('addNamedImport', () => {
  it('adds a new module in its group and alphabetical place', () => {
    const text = "import { z } from 'zod';\n\nimport { A } from '@features/a/api/schemas';\n\nimport { b } from './b';\n";
    const out = addNamedImport(text, '@services/http/request', 'request');
    expect(out).toBe(
      "import { z } from 'zod';\n\nimport { A } from '@features/a/api/schemas';\nimport { request } from '@services/http/request';\n\nimport { b } from './b';\n",
    );
    expect(addNamedImport(out, './a', 'a')).toContain("import { a } from './a';\nimport { b } from './b';");
  });

  it('joins an existing import of the same module, once', () => {
    const text = "import { useQuery } from '@tanstack/react-query';\n";
    const out = addNamedImport(text, '@tanstack/react-query', 'useMutation');
    expect(out).toBe("import { useQuery, useMutation } from '@tanstack/react-query';\n");
    expect(addNamedImport(out, '@tanstack/react-query', 'useMutation')).toBe(out);
  });

  it('handles type imports and an empty file', () => {
    expect(addNamedImport('', './schemas', 'X', 'type')).toBe("import type { X } from './schemas';\n\n");
    const joined = addNamedImport("import { A } from './schemas';\n", './schemas', 'X', 'type');
    expect(joined).toBe("import { A, type X } from './schemas';\n");
  });

  it('merges a multi-line import', () => {
    const text = "import {\n  A,\n  B,\n} from './schemas';\n";
    expect(addNamedImport(text, './schemas', 'C')).toBe("import { A, B, C } from './schemas';\n");
  });
});

describe('tempo g endpoint', () => {
  let dir = '';
  let cleanup = async () => {};
  const read = (rel: string) => readFile(path.join(dir, rel), 'utf8');
  const date = new Date('2026-03-04T12:00:00Z');

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir('tempo-endpoint'));
    await copyFixtureProject(dir);
    await generateFeature('orders', { projectDir: dir, date });
    await mkdir(path.join(dir, 'backend'), { recursive: true });
    await writeFile(path.join(dir, 'backend/backend.json'), BACKEND);
  });
  afterEach(async () => cleanup());

  const files = ['backend/backend.json', 'src/features/orders/api/schemas.ts', 'src/features/orders/api/orders.api.ts', 'src/features/orders/api/keys.ts', 'src/features/orders/api/queries.ts', 'src/features/orders/api/mutations.ts'];
  async function written(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const rel of files) if (await pathExists(path.join(dir, rel))) out[rel] = await read(rel);
    return out;
  }
  const backend = async (): Promise<{ collections: { name: string }[]; endpoints: Record<string, unknown>[] }> => JSON.parse(await read('backend/backend.json'));

  it('GET with a path param: schema, request, key, query hook and a static backend endpoint', async () => {
    const result = await generateEndpoint('orders.getOrder', { projectDir: dir, date, path: '/orders/:id' });
    expect(result.created.sort()).toEqual(['src/features/orders/api/orders.api.ts', 'src/features/orders/api/schemas.ts']);
    expect(result.updated.sort()).toEqual(['backend/backend.json', 'src/features/orders/api/keys.ts', 'src/features/orders/api/queries.ts']);
    expect(await written()).toMatchSnapshot();
  });

  it('POST with a body: request schema and a mutation that invalidates the feature keys', async () => {
    await generateEndpoint('orders.createOrder', { projectDir: dir, date, method: 'post', path: '/orders' });
    expect(await written()).toMatchSnapshot();
  });

  it('PUT with a param and a body takes one object; DELETE takes the param', async () => {
    await generateEndpoint('orders.updateOrder', { projectDir: dir, date, method: 'PUT', path: '/orders/:id' });
    await generateEndpoint('orders.removeOrder', { projectDir: dir, date, method: 'DELETE', path: '/orders/:id' });
    const api = await read('src/features/orders/api/orders.api.ts');
    expect(api).toContain('{ id, body }: Readonly<{ id: string; body: UpdateOrderRequest }>');
    expect(api).toContain('export function removeOrder(id: string)');
    expect(await read('src/features/orders/api/mutations.ts')).toContain('mutationFn: updateOrder');
    expect((await backend()).endpoints.map((endpoint) => `${String(endpoint.method)} ${String(endpoint.path)}`)).toEqual(['GET /hello', 'PUT /orders/:id', 'DELETE /orders/:id']);
  });

  it('--resource: five request functions, list and detail keys, five hooks, a collection and five crud endpoints', async () => {
    await generateEndpoint('orders.invoices', { projectDir: dir, date, resource: true });
    expect(await written()).toMatchSnapshot();
    const added = await backend();
    expect(added.collections.map((collection) => collection.name)).toEqual(['invoices']);
    expect(added.endpoints.slice(1).map((endpoint) => [endpoint.type, endpoint.action, endpoint.method, endpoint.path])).toEqual([
      ['crud', 'list', 'GET', '/invoices'],
      ['crud', 'get', 'GET', '/invoices/:id'],
      ['crud', 'create', 'POST', '/invoices'],
      ['crud', 'update', 'PATCH', '/invoices/:id'],
      ['crud', 'delete', 'DELETE', '/invoices/:id'],
    ]);
  });

  it('keeps the existing entries and key order, with 2-space indent and a trailing newline', async () => {
    await generateEndpoint('orders.getOrder', { projectDir: dir, date, path: '/orders/:id' });
    const text = await read('backend/backend.json');
    expect(text.endsWith('}\n')).toBe(true);
    expect(Object.keys(JSON.parse(text))).toEqual(['name', 'port', 'auth', 'collections', 'endpoints']);
    expect(text).toContain('\n    {\n      "id": "app.hello"');
    expect((await backend()).endpoints[0]).toEqual({ id: 'app.hello', type: 'static', method: 'GET', path: '/hello', body: { hello: 'world' } });
  });

  it('a second endpoint appends to the same files and adds names to the existing imports', async () => {
    await generateEndpoint('orders.getOrder', { projectDir: dir, date, path: '/orders/:id' });
    await generateEndpoint('orders.listOrders', { projectDir: dir, date, path: '/orders' });
    const api = await read('src/features/orders/api/orders.api.ts');
    expect(api).toContain('export function getOrder');
    expect(api).toContain('export function listOrders');
    expect(await read('src/features/orders/api/queries.ts')).toMatch(/import \{[^}]*getOrder[^}]*listOrders[^}]*\} from/);
    expect((await backend()).endpoints).toHaveLength(3);
  });

  it('without backend/backend.json it writes the app code and says no backend was found', async () => {
    await rm(path.join(dir, 'backend'), { recursive: true });
    const result = await generateEndpoint('orders.getOrder', { projectDir: dir, date, path: '/orders/:id' });
    expect(result.created).toContain('src/features/orders/api/orders.api.ts');
    expect(result.updated).not.toContain('backend/backend.json');
    expect(result.followUps.join('\n')).toContain('No backend/backend.json found');
    expect(await pathExists(path.join(dir, 'backend'))).toBe(false);
  });

  it('refuses a name that exists, an unknown feature, a bad method and a bad path', async () => {
    await generateEndpoint('orders.getOrder', { projectDir: dir, date });
    await expect(generateEndpoint('orders.getOrder', { projectDir: dir, date })).rejects.toMatchObject({ code: 'FILE_EXISTS' });
    await expect(generateEndpoint('nothing.get', { projectDir: dir, date })).rejects.toMatchObject({ code: 'FEATURE_NOT_FOUND' });
    await expect(generateEndpoint('orders.x', { projectDir: dir, date, method: 'FETCH' })).rejects.toMatchObject({ code: 'INVALID_METHOD' });
    await expect(generateEndpoint('orders.x', { projectDir: dir, date, path: 'no-slash' })).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(generateEndpoint('orders', { projectDir: dir, date })).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(generateEndpoint('orders.x', { projectDir: dir, date, resource: true, method: 'POST' })).rejects.toMatchObject({ code: 'INVALID_METHOD' });
  });

  it('refuses a method + path the backend already has, and writes nothing', async () => {
    const before = await written();
    await expect(generateEndpoint('orders.hello', { projectDir: dir, date, path: '/hello' })).rejects.toMatchObject({ code: 'ENDPOINT_EXISTS' });
    expect(await written()).toEqual(before);
    // Another method on the same path is fine.
    await generateEndpoint('orders.sayHello', { projectDir: dir, date, method: 'POST', path: '/hello' });
    expect((await backend()).endpoints).toHaveLength(2);
  });

  it('refuses a resource whose collection already exists', async () => {
    await generateEndpoint('orders.invoices', { projectDir: dir, date, resource: true });
    await expect(generateEndpoint('orders.invoices', { projectDir: dir, date, resource: true })).rejects.toMatchObject({ code: 'FILE_EXISTS' });
    await writeFile(path.join(dir, 'backend/backend.json'), `${JSON.stringify({ collections: [{ name: 'receipts' }], endpoints: [] })}\n`);
    await expect(generateEndpoint('orders.receipts', { projectDir: dir, date, resource: true })).rejects.toMatchObject({ code: 'ENDPOINT_EXISTS' });
  });

  it('refuses a backend.json that is not valid', async () => {
    await writeFile(path.join(dir, 'backend/backend.json'), '{ nope');
    await expect(generateEndpoint('orders.getOrder', { projectDir: dir, date })).rejects.toMatchObject({ code: 'BACKEND_UNPARSEABLE' });
    await writeFile(path.join(dir, 'backend/backend.json'), '{ "endpoints": {} }');
    await expect(generateEndpoint('orders.getOrder', { projectDir: dir, date })).rejects.toMatchObject({ code: 'BACKEND_UNPARSEABLE' });
  });

  it('--dry-run writes nothing', async () => {
    const before = await walkFiles(dir);
    const result = await generateEndpoint('orders.getOrder', { projectDir: dir, date, dryRun: true });
    expect(result.created.length).toBeGreaterThan(0);
    expect(await walkFiles(dir)).toEqual(before);
    expect(await read('backend/backend.json')).toBe(BACKEND);
  });

  it('the command prints one JSON document', async () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => (out.push(String(chunk)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await runCommand(generateCommand, { rawArgs: ['endpoint', 'orders.getOrder', '--path', '/orders/:id', '--json', '--cwd', dir] });
    } finally {
      vi.restoreAllMocks();
    }
    const json = JSON.parse(out.join('')) as { ok: boolean; kind: string; created: string[]; updated: string[] };
    expect(json).toMatchObject({ ok: true, kind: 'endpoint' });
    expect(json.updated).toContain('backend/backend.json');
    expect((await backend()).endpoints.some((endpoint) => endpoint.path === '/orders/:id')).toBe(true);
  });
});
