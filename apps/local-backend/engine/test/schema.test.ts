import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { backendJsonSchema, DefinitionError, parseBackend } from '../src/schema.ts';
import { crudEndpoints } from '../src/folder.ts';

const minimal = { name: 'demo' };
const products = {
  name: 'products',
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'price', type: 'number' },
  ],
};

function issuesOf(input: unknown): string[] {
  try {
    parseBackend(input);
  } catch (error) {
    if (error instanceof DefinitionError) return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
    throw error;
  }
  return [];
}

describe('backend.json schema', () => {
  it('fills the defaults', () => {
    const def = parseBackend(minimal);
    expect(def).toMatchObject({ port: 8443, https: true, collections: [], endpoints: [], media: { maxBytes: 104_857_600 } });
    expect(def.auth.accessTtlMin).toBe(30);
  });

  it('accepts every field type and every endpoint type', () => {
    const def = parseBackend({
      name: 'all',
      collections: [
        {
          name: 'items',
          fields: [
            { name: 'a', type: 'string' },
            { name: 'b', type: 'number' },
            { name: 'c', type: 'boolean' },
            { name: 'd', type: 'date' },
            { name: 'e', type: 'enum', enumValues: ['x'] },
            { name: 'f', type: 'json' },
            { name: 'g', type: 'relation', relationTo: 'items' },
            { name: 'h', type: 'media' },
          ],
        },
      ],
      endpoints: [
        { id: 'a', type: 'static', method: 'GET', path: '/a' },
        { id: 'b', type: 'auth', method: 'POST', path: '/login', action: 'login' },
        { id: 'c', type: 'upload', method: 'POST', path: '/up' },
        { id: 'd', type: 'download', method: 'GET', path: '/down/:id' },
        { id: 'e', type: 'handler', method: 'POST', path: '/h', file: 'handlers/h.js' },
        { id: 'f', type: 'users', method: 'POST', path: '/users/add', action: 'add' },
      ],
      contentTypes: [{ name: 'article' }],
    });
    expect(def.endpoints).toHaveLength(6);
  });

  it('refuses a users get or update endpoint without bearer auth (fail closed)', () => {
    for (const [action, method] of [['update', 'PUT'], ['get', 'GET']] as const) {
      const issues = issuesOf({ name: 'x', endpoints: [{ id: 'u', type: 'users', method, path: '/users/:id', action }] });
      expect(issues.some((issue) => issue.startsWith('endpoints[0].auth') && issue.includes('bearer'))).toBe(true);
      expect(issuesOf({ name: 'x', endpoints: [{ id: 'u', type: 'users', method, path: '/users/:id', action, auth: 'bearer' }] })).toEqual([]);
    }
  });

  it('names the path of every problem', () => {
    const issues = issuesOf({
      name: 'x',
      collections: [{ name: 'Bad-Name', fields: [] }],
      endpoints: [{ id: 'a', type: 'static', method: 'GET', path: 'nope' }],
    });
    expect(issues.some((issue) => issue.startsWith('collections[0].name'))).toBe(true);
    expect(issues.some((issue) => issue.startsWith('endpoints[0].path'))).toBe(true);
  });

  it('rejects unknown keys, bad identifiers and the reserved id field', () => {
    expect(issuesOf({ ...minimal, extra: 1 })).not.toEqual([]);
    expect(issuesOf({ name: 'x', collections: [{ name: 'a', fields: [{ name: 'id', type: 'string' }] }] }).join()).toContain('"id" is added');
    expect(issuesOf({ name: 'x', collections: [{ name: 'a"; DROP TABLE x;--', fields: [] }] })).not.toEqual([]);
    expect(issuesOf({ name: 'x', collections: [{ name: 'sqlite_master', fields: [] }] })).not.toEqual([]);
  });

  it('checks enum, relation and cross references', () => {
    expect(issuesOf({ name: 'x', collections: [{ name: 'a', fields: [{ name: 'k', type: 'enum' }] }] }).join()).toContain('enumValues');
    expect(issuesOf({ name: 'x', collections: [{ name: 'a', fields: [{ name: 'k', type: 'relation', relationTo: 'zzz' }] }] }).join()).toContain('Unknown collection');
    expect(
      issuesOf({ name: 'x', endpoints: [{ id: 'a', type: 'crud', collection: 'nope', action: 'list', method: 'GET', path: '/a' }] }).join(),
    ).toContain('Unknown collection "nope"');
  });

  it('rejects duplicates, reserved paths and mismatched crud methods', () => {
    const base = { collections: [products] };
    const crud = { type: 'crud', collection: 'products' };
    expect(issuesOf({ name: 'x', ...base, endpoints: [{ id: 'a', ...crud, action: 'list', method: 'GET', path: '/p' }, { id: 'a', ...crud, action: 'list', method: 'GET', path: '/q' }] }).join()).toContain('Duplicate endpoint id');
    expect(issuesOf({ name: 'x', ...base, endpoints: [{ id: 'a', ...crud, action: 'list', method: 'GET', path: '/p' }, { id: 'b', ...crud, action: 'list', method: 'GET', path: '/p' }] }).join()).toContain('already answers');
    expect(issuesOf({ name: 'x', endpoints: [{ id: 'a', type: 'static', method: 'GET', path: '/__admin/x' }] }).join()).toContain('reserved');
    expect(issuesOf({ name: 'x', ...base, endpoints: [{ id: 'a', ...crud, action: 'create', method: 'GET', path: '/p' }] }).join()).toContain('uses POST');
    expect(issuesOf({ name: 'x', ...base, endpoints: [{ id: 'a', ...crud, action: 'get', method: 'GET', path: '/p' }] }).join()).toContain(':id');
    expect(issuesOf({ name: 'x', ...base, endpoints: [{ id: 'a', ...crud, action: 'list', method: 'GET', path: '/p', hiddenFields: ['ghost'] }] }).join()).toContain('no field "ghost"');
  });

  it('accepts the generated crud endpoints', () => {
    expect(issuesOf({ name: 'x', collections: [products], endpoints: crudEndpoints('products', { basePath: '/products', addAlias: true }) })).toEqual([]);
  });

  it('keeps schemas/backend.schema.json in sync with the Zod schema', () => {
    const file = join(import.meta.dirname, '../schemas/backend.schema.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(backendJsonSchema())));
  });
});
