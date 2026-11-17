import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { startBackend } from '../src/app.ts';
import { checkContract, formatReport } from '../src/contract.ts';
import { createBackend, presetDefinition } from '../src/folder.ts';
import { parseBackend, type Backend } from '../src/schema.ts';

import { json, stopAll, tempDir } from './helpers.ts';

afterEach(stopAll);

const TEMPLATE_OPENAPI = resolve(import.meta.dirname, '../../../../template/api/generated/openapi.json');
const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const template = JSON.parse(readFileSync(TEMPLATE_OPENAPI, 'utf8')) as Record<string, unknown>;

/** The preset definition, parsed; `change` edits the raw input first. */
function preset(change: (input: ReturnType<typeof presetDefinition> & { endpoints: Record<string, unknown>[]; collections: Record<string, unknown>[] }) => void = () => undefined): Backend {
  const input = structuredClone(presetDefinition('t', 'tempo-template')) as ReturnType<typeof presetDefinition> & { endpoints: Record<string, unknown>[]; collections: Record<string, unknown>[] };
  change(input);
  return parseBackend(input);
}

describe('contract check against the template openapi.json (AC-LB-8)', () => {
  it('reports no differences for the Tempo template preset', () => {
    const report = checkContract(preset(), template);
    expect(report.differences).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(report.methodMismatches).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts).toMatchObject({ fileEndpoints: 13, matched: 13 });
    // Extras are information only: the REST path of create, the media routes and the stats handler.
    expect(report.extra.map((ref) => `${ref.method} ${ref.path}`)).toEqual(['GET /media/{id}', 'POST /media/upload', 'POST /products', 'GET /stats/summary']);
    expect(formatReport(report)).toMatch(/^No differences\./);
  });

  it('reports a missing endpoint, a wrong method and the property path of each shape difference', () => {
    const broken = preset((input) => {
      input.endpoints = input.endpoints.filter((endpoint) => endpoint.id !== 'auth.otpResend');
      const update = input.endpoints.find((endpoint) => endpoint.id === 'users.update');
      if (update !== undefined) update.method = 'PATCH';
      const products = input.collections[0] as { fields: { name: string; type: string; default?: unknown }[] };
      products.fields = products.fields.filter((field) => field.name !== 'thumbnail');
      const price = products.fields.find((field) => field.name === 'price');
      if (price !== undefined) Object.assign(price, { type: 'string', default: '' });
      (input.collections[0] as { seed?: unknown }).seed = [];
      const config = input.endpoints.find((endpoint) => endpoint.id === 'appConfig.get') as { body: { storeUrls: Record<string, unknown> } };
      delete config.body.storeUrls.ios;
    });
    const report = checkContract(broken, template);
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([{ method: 'POST', path: '/auth/otp/resend' }]);
    expect(report.methodMismatches).toEqual([{ method: 'PUT', path: '/users/{id}', backendMethods: ['PATCH'] }]);
    const seen = report.differences.map((diff) => `${diff.method} ${diff.path} ${diff.status} ${diff.property} ${diff.kind}`);
    expect(seen).toEqual(
      expect.arrayContaining([
        'GET /app-config 200 storeUrls.ios missing-property',
        'GET /products 200 products[].price type',
        'GET /products 200 products[].thumbnail missing-property',
        'GET /products/search 200 products[].thumbnail missing-property',
        'GET /products/{id} 200 price type',
        'GET /products/{id} 200 thumbnail missing-property',
      ]),
    );
    const text = formatReport(report);
    expect(text).toContain('Missing in the backend:');
    expect(text).toContain('POST /auth/otp/resend');
    expect(text).toContain('products[].price');
  });

  it('compares required-ness, null and enums at the property level, and the success status', () => {
    const doc = (schema: unknown, status = '200'): Record<string, unknown> => ({
      openapi: '3.1.0',
      paths: { '/x': { get: { responses: { [status]: { description: 'ok', content: { 'application/json': { schema } } } } } } },
    });
    const backend = parseBackend({
      name: 'x',
      endpoints: [{ id: 'x', type: 'static', method: 'GET', path: '/x', body: { kind: 'c', size: 1.5, nested: { a: 'x' }, list: [{ n: 1 }] } }],
    });
    const wanted = {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['a', 'b'] }, size: { type: 'integer' }, nested: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a', 'b'] }, list: { type: 'array', items: { type: 'object', properties: { n: { type: 'string' } } } }, extra: { type: 'string' } },
      required: ['kind', 'size', 'extra'],
    };
    const diffs = checkContract(backend, doc(wanted)).differences.map((diff) => `${diff.property}:${diff.kind}`);
    expect(diffs).toEqual(expect.arrayContaining(['kind:enum', 'size:type', 'nested.b:missing-property', 'list[].n:type', 'extra:missing-property']));
    expect(checkContract(backend, doc({ type: 'object' }, '201')).differences.map((diff) => diff.kind)).toEqual(['status']);
    // Nullable and optional fields of a collection: the file wants a string that is always there.
    const optional = parseBackend({
      name: 'y',
      collections: [{ name: 'things', fields: [{ name: 'label', type: 'string' }] }],
      endpoints: [{ id: 'g', type: 'crud', collection: 'things', action: 'get', method: 'GET', path: '/things/:id' }],
    });
    const file = { openapi: '3.1.0', paths: { '/things/{thingId}': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'number' }, label: { type: 'string' } }, required: ['id', 'label'] } } } } } } } } };
    expect(checkContract(optional, file).differences.map((diff) => `${diff.property}:${diff.kind}`)).toEqual(['label:not-required', 'label:nullable']);
  });

  it('notes answers it cannot compare (a handler has no declared shape)', () => {
    const backend = parseBackend({ name: 'h', endpoints: [{ id: 'h', type: 'handler', method: 'GET', path: '/h', file: 'handlers/h.js' }] });
    const file = { openapi: '3.1.0', paths: { '/h': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } } } } } };
    const report = checkContract(backend, file);
    expect(report.ok).toBe(true);
    expect(report.unchecked).toHaveLength(1);
  });
});

describe('admin route and CLI', () => {
  it('POST /__admin/contract-check takes a document or a path inside the backend folder', async () => {
    const dir = join(tempDir(), 'b');
    createBackend(dir, { name: 'Tempo template', preset: 'tempo-template' });
    writeFileSync(join(dir, 'contract.json'), JSON.stringify(template));
    const backend = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, watch: false });
    try {
      const call = (body: unknown, token = backend.admin.token): Promise<Response> =>
        fetch(`http://127.0.0.1:${backend.admin.port}/__admin/contract-check`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect(await json(await call(template))).toMatchObject({ ok: true, differences: [], missing: [] });
      expect(await json(await call({ path: 'contract.json' }))).toMatchObject({ ok: true });
      expect((await call({ path: '../outside.json' })).status).toBe(400);
      expect((await call({ path: '/etc/hosts' })).status).toBe(400);
      expect((await call({ nothing: true })).status).toBe(400);
      expect((await call(template, 'wrong')).status).toBe(401);
      // A link inside the folder that points outside is refused.
      const outside = join(tempDir(), 'o.json');
      writeFileSync(outside, JSON.stringify(template));
      mkdirSync(join(dir, 'sub'));
      symlinkSync(outside, join(dir, 'sub', 'link.json'));
      expect((await call({ path: 'sub/link.json' })).status).toBe(400);
      // The public listener has no such route.
      expect((await fetch(`http://127.0.0.1:${backend.port}/__admin/contract-check`, { method: 'POST' })).status).toBe(404);
    } finally {
      await backend.stop();
    }
  });

  it('`check` prints text, exits 0 without differences and 1 with them', () => {
    const dir = join(tempDir(), 'b');
    createBackend(dir, { name: 'Tempo template', preset: 'tempo-template' });
    const file = join(tempDir(), 'openapi.json');
    writeFileSync(file, JSON.stringify(template));
    const ok = spawnSync('node', [CLI, 'check', dir, '--openapi', file], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('No differences.');
    const withExtra = JSON.parse(readFileSync(file, 'utf8')) as { paths: Record<string, unknown> };
    withExtra.paths['/only/in/file'] = { get: { responses: { '200': { description: 'ok' } } } };
    writeFileSync(file, JSON.stringify(withExtra));
    const bad = spawnSync('node', [CLI, 'check', dir, '--openapi', file, '--json'], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stdout)).toMatchObject({ ok: false, missing: [{ method: 'GET', path: '/only/in/file' }] });
    expect(spawnSync('node', [CLI, 'check', dir], { encoding: 'utf8' }).status).toBe(1);
  });
});
