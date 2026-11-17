import { describe, expect, it } from 'vitest';

import { buildWorkspace, emptyEndpoint, emptyScenario, parseDraft, serializeWorkspace, suggestId } from './workspace';

const FILE = JSON.stringify({
  name: 'Shop',
  port: 8600,
  endpoints: [
    {
      id: 'get.products.:id',
      method: 'GET',
      path: '/products/:id',
      summary: 'One product',
      tags: ['products'],
      request: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
      response: { status: 200, schema: { type: 'object' }, example: { id: 1 } },
      scenarios: { gone: { status: 410, body: { message: 'gone' } } },
    },
  ],
});

describe('parseDraft', () => {
  it('reads fields into editable text', () => {
    const draft = parseDraft(FILE);
    expect(draft.name).toBe('Shop');
    expect(draft.port).toBe('8600');
    const endpoint = draft.endpoints[0];
    expect(endpoint?.tags).toBe('products');
    expect(endpoint?.example).toContain('"id": 1');
    expect(endpoint?.scenarios[0]).toMatchObject({ name: 'gone', status: '410' });
  });

  it('refuses text that is not a workspace object', () => {
    expect(() => parseDraft('{oops')).toThrow('not valid JSON');
    expect(() => parseDraft('[]')).toThrow('JSON object');
  });
});

describe('buildWorkspace', () => {
  it('round-trips an unchanged file, keeping what the editor does not show', () => {
    const result = buildWorkspace(parseDraft(FILE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace).toEqual(JSON.parse(FILE));
  });

  it('applies edits', () => {
    const draft = parseDraft(FILE);
    const endpoint = draft.endpoints[0];
    if (endpoint === undefined) throw new Error('no endpoint');
    endpoint.status = '201';
    endpoint.bearer = true;
    endpoint.tags = 'a, b';
    endpoint.example = '{"id":2}';
    endpoint.scenarios.push({ ...emptyScenario(2), status: '503', delayMs: '100' });
    const result = buildWorkspace(draft);
    expect(result.ok && result.workspace.endpoints[0]).toMatchObject({
      auth: 'bearer',
      tags: ['a', 'b'],
      response: { status: 201, example: { id: 2 } },
      scenarios: { gone: { status: 410 }, scenario2: { status: 503, delayMs: 100 } },
    });
  });

  it('reports invalid JSON in an example, with where it is', () => {
    const draft = parseDraft(FILE);
    const endpoint = draft.endpoints[0];
    if (endpoint === undefined) throw new Error('no endpoint');
    endpoint.example = '{nope';
    const result = buildWorkspace(draft);
    expect(result).toEqual({ ok: false, errors: ['get.products.:id example: not valid JSON'] });
  });

  it('reports schema problems by path (path without a slash, bad status, missing name)', () => {
    const draft = parseDraft(FILE);
    const endpoint = draft.endpoints[0];
    if (endpoint === undefined) throw new Error('no endpoint');
    endpoint.path = 'products';
    endpoint.status = '99';
    draft.name = '';
    const result = buildWorkspace(draft);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.startsWith('endpoints.0.path'))).toBe(true);
    expect(result.errors.some((error) => error.startsWith('endpoints.0.response.status'))).toBe(true);
    expect(result.errors.some((error) => error.startsWith('name'))).toBe(true);
  });

  it('rejects a duplicate endpoint id', () => {
    const draft = parseDraft(FILE);
    const first = draft.endpoints[0];
    if (first === undefined) throw new Error('no endpoint');
    draft.endpoints.push({ ...first });
    const result = buildWorkspace(draft);
    expect(!result.ok && result.errors.some((error) => error.includes('used twice'))).toBe(true);
  });

  it('accepts a new empty endpoint', () => {
    const draft = parseDraft(FILE);
    draft.endpoints.push(emptyEndpoint(2));
    expect(buildWorkspace(draft).ok).toBe(true);
  });
});

describe('helpers', () => {
  it('suggests an id in the convention scenarios use', () => {
    expect(suggestId('GET', '/products/:id')).toBe('get.products.:id');
    expect(suggestId('POST', '/')).toBe('post');
  });

  it('serializes with a trailing newline', () => {
    const result = buildWorkspace(parseDraft(FILE));
    expect(result.ok && serializeWorkspace(result.workspace).endsWith('}\n')).toBe(true);
  });
});
