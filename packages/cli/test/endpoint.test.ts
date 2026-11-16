import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import generateCommand from '../src/commands/generate.ts';
import { addNamedImport, appendToArray, generateEndpoint } from '../src/lib/endpoint.ts';
import { pathExists, walkFiles } from '../src/lib/fs-utils.ts';
import { generateFeature } from '../src/lib/scaffold.ts';
import { copyFixtureProject, makeTempDir } from './helpers.ts';

const CONFIG = `import { defineConfig } from '@rn-tempo/api-contract';

import { login } from './endpoints/auth';

export default defineConfig({
  auth: false,
  endpoints: [
    login,
    // @tempo-feature:samples:start
    listProducts,
    // @tempo-feature:samples:end
  ],
});
`;

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

describe('appendToArray', () => {
  it('adds an entry after the last one, keeping comments and markers', () => {
    const out = appendToArray(CONFIG, /endpoints:\s*\[/, 'getThing');
    expect(out).toContain('    // @tempo-feature:samples:end\n    getThing,\n  ],');
  });

  it('adds a missing comma, handles an empty array and skips a name already there', () => {
    expect(appendToArray('x = { endpoints: [a] }', /endpoints:\s*\[/, 'b')).toContain('[a,\n    b,\n]');
    expect(appendToArray('endpoints: []', /endpoints:\s*\[/, 'b')).toBe('endpoints: [\n    b,\n]');
    expect(appendToArray(CONFIG, /endpoints:\s*\[/, 'login')).toBe(CONFIG);
    expect(appendToArray('nothing here', /endpoints:\s*\[/, 'b')).toBeNull();
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
    await mkdir(path.join(dir, 'api'), { recursive: true });
    await writeFile(path.join(dir, 'api/tempo-api.config.ts'), CONFIG);
  });
  afterEach(async () => cleanup());

  const files = ['api/tempo-api.config.ts', 'api/endpoints/orders.ts', 'src/features/orders/api/schemas.ts', 'src/features/orders/api/orders.api.ts', 'src/features/orders/api/keys.ts', 'src/features/orders/api/queries.ts', 'src/features/orders/api/mutations.ts'];
  async function written(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const rel of files) if (await pathExists(path.join(dir, rel))) out[rel] = await read(rel);
    return out;
  }

  it('GET with a path param: definition, schema, request, key, query hook and registration', async () => {
    const result = await generateEndpoint('orders.getOrder', { projectDir: dir, date, path: '/orders/:id' });
    expect(result.created.sort()).toEqual(['api/endpoints/orders.ts', 'src/features/orders/api/orders.api.ts', 'src/features/orders/api/schemas.ts']);
    expect(result.updated.sort()).toEqual(['api/tempo-api.config.ts', 'src/features/orders/api/keys.ts', 'src/features/orders/api/queries.ts']);
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
  });

  it('--resource: five request functions, list and detail keys, five hooks and listed seed items', async () => {
    await generateEndpoint('orders.invoices', { projectDir: dir, date, resource: true });
    expect(await written()).toMatchSnapshot();
  });

  it('a second endpoint appends to the same files and adds names to the existing imports', async () => {
    await generateEndpoint('orders.getOrder', { projectDir: dir, date, path: '/orders/:id' });
    await generateEndpoint('orders.listOrders', { projectDir: dir, date, path: '/orders' });
    const definitions = await read('api/endpoints/orders.ts');
    expect(definitions.match(/from '@features\/orders\/api\/schemas'/g)).toHaveLength(1);
    expect(definitions).toContain('export const getOrder');
    expect(definitions).toContain('export const listOrders');
    expect(await read('api/tempo-api.config.ts')).toContain('import { getOrder, listOrders } from');
  });

  it('refuses a name that exists, an unknown feature, a bad method, a bad path and a missing config', async () => {
    await generateEndpoint('orders.getOrder', { projectDir: dir, date });
    await expect(generateEndpoint('orders.getOrder', { projectDir: dir, date })).rejects.toMatchObject({ code: 'FILE_EXISTS' });
    await expect(generateEndpoint('nothing.get', { projectDir: dir, date })).rejects.toMatchObject({ code: 'FEATURE_NOT_FOUND' });
    await expect(generateEndpoint('orders.x', { projectDir: dir, date, method: 'FETCH' })).rejects.toMatchObject({ code: 'INVALID_METHOD' });
    await expect(generateEndpoint('orders.x', { projectDir: dir, date, path: 'no-slash' })).rejects.toMatchObject({ code: 'INVALID_PATH' });
    await expect(generateEndpoint('orders', { projectDir: dir, date })).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(generateEndpoint('orders.x', { projectDir: dir, date, resource: true, method: 'POST' })).rejects.toMatchObject({ code: 'INVALID_METHOD' });
    await writeFile(path.join(dir, 'api/tempo-api.config.ts'), 'export default {};\n');
    await expect(generateEndpoint('orders.other', { projectDir: dir, date })).rejects.toMatchObject({ code: 'CONFIG_UNPARSEABLE' });
  });

  it('--dry-run writes nothing', async () => {
    const before = await walkFiles(dir);
    const result = await generateEndpoint('orders.getOrder', { projectDir: dir, date, dryRun: true });
    expect(result.created.length).toBeGreaterThan(0);
    expect(await walkFiles(dir)).toEqual(before);
    expect(await read('api/tempo-api.config.ts')).toBe(CONFIG);
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
    expect(json.created).toContain('api/endpoints/orders.ts');
    expect(await pathExists(path.join(dir, 'api/endpoints/orders.ts'))).toBe(true);
  });
});
