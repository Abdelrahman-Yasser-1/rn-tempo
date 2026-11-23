import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkContract } from '../src/contract.ts';
import { createBackend, presetDefinition } from '../src/folder.ts';
import { buildOpenApi } from '../src/openapi.ts';
import { startBackend } from '../src/app.ts';
import { BackendSchema, parseBackend, type BackendInput } from '../src/schema.ts';

import { json, serve, stopAll, tempDir } from './helpers.ts';
import { member, startSite, stopTeams } from './team-helpers.ts';

afterEach(async () => {
  await stopAll();
  await stopTeams();
});

const WRAPPER = { success: true, data: '{{body}}', message: null };

const definition = (extra: Partial<BackendInput> = {}): BackendInput => ({
  name: 'wrapped',
  collections: [{ name: 'items', fields: [{ name: 'title', type: 'string', required: true }], seed: [{ title: 'one' }, { title: 'two' }] }],
  endpoints: [
    { id: 'config', type: 'static', method: 'GET', path: '/config', body: { theme: 'dark' }, headers: { 'x-own': 'static' } },
    { id: 'nowrap', type: 'static', method: 'GET', path: '/nowrap', wrap: 'none', body: { raw: true } },
    { id: 'empty', type: 'static', method: 'DELETE', path: '/empty', status: 204 },
    { id: 'checked', type: 'static', method: 'POST', path: '/checked', body: {}, request: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }, bodyRequired: true } },
    { id: 'items.list', type: 'crud', collection: 'items', action: 'list', method: 'GET', path: '/items', headers: { 'x-endpoint': 'crud' } },
    { id: 'items.get', type: 'crud', collection: 'items', action: 'get', method: 'GET', path: '/items/:id' },
    { id: 'secure', type: 'static', method: 'GET', path: '/secure', auth: 'bearer', body: { id: 1 } },
    { id: 'boom', type: 'static', method: 'GET', path: '/boom', body: { ok: true }, scenarios: { rate: { status: 429, headers: { 'retry-after': '9' } }, custom: { status: 409, body: { mine: true } }, fine: { body: { scenario: true } } } },
  ],
  ...extra,
});

describe('AC-LP-6 the shared success wrapper', () => {
  it('AC-LP-6 puts the endpoint body where {{body}} is, keeping its type', async () => {
    const { url } = await serve(definition({ responses: { success: WRAPPER } }));
    expect(await json(await fetch(`${url}/config`))).toEqual({ success: true, data: { theme: 'dark' }, message: null });
    const list = await json(await fetch(`${url}/items`));
    expect(list).toMatchObject({ success: true, message: null });
    expect((list.data as { items?: unknown; total: number }).total).toBe(2);
    expect(await json(await fetch(`${url}/items/1`))).toMatchObject({ success: true, data: { id: 1, title: 'one' } });
    // A scenario body is a success answer too.
    expect(await json(await fetch(`${url}/boom`, { headers: { 'x-tempo-scenario': 'fine' } }))).toEqual({ success: true, data: { scenario: true }, message: null });
  });

  it('AC-LP-6 leaves errors, empty answers and opted-out endpoints alone', async () => {
    const { url } = await serve(definition({ responses: { success: WRAPPER } }));
    expect(await json(await fetch(`${url}/nowrap`))).toEqual({ raw: true });
    expect((await fetch(`${url}/empty`, { method: 'DELETE' })).status).toBe(204);
    const missing = await fetch(`${url}/items/99`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('problem+json');
    const own = await fetch(`${url}/boom`, { headers: { 'x-tempo-scenario': 'custom' } });
    expect(await json(own)).toEqual({ mine: true });
  });

  it('AC-LP-6 can use a named template as the wrapper of one endpoint', async () => {
    const { url } = await serve(
      definition({
        responses: { success: WRAPPER },
        responseTemplates: { envelope: { body: { ok: true, result: '{{body}}', page: 1 } } },
        endpoints: [{ id: 'a', type: 'static', method: 'GET', path: '/a', wrap: 'envelope', body: [1, 2] }],
      }),
    );
    expect(await json(await fetch(`${url}/a`))).toEqual({ ok: true, result: [1, 2], page: 1 });
  });

  it('AC-LP-6 does not run placeholder-looking text of stored data through the wrapper again', async () => {
    const { url } = await serve(
      definition({
        responses: { success: WRAPPER },
        collections: [{ name: 'items', fields: [{ name: 'title', type: 'string' }], seed: [{ title: '{{uuid}} {{params.id}}' }] }],
        endpoints: [{ id: 'items.get', type: 'crud', collection: 'items', action: 'get', method: 'GET', path: '/items/:id' }],
      }),
    );
    expect(await json(await fetch(`${url}/items/1`))).toMatchObject({ data: { title: '{{uuid}} {{params.id}}' } });
  });

  it('AC-LP-6 refuses a wrapper without {{body}}, a missing template and a custom error without a template', () => {
    expect(() => parseBackend({ name: 'x', responses: { success: { data: 1 } } })).toThrow(/needs a "\{\{body\}\}"/);
    expect(() => parseBackend({ name: 'x', endpoints: [{ id: 'a', type: 'static', method: 'GET', path: '/a', wrap: 'nope' }] })).toThrow(/no response template named "nope"/);
    expect(() => parseBackend({ name: 'x', responseTemplates: { t: { body: { a: 1 } } }, endpoints: [{ id: 'a', type: 'static', method: 'GET', path: '/a', wrap: 't' }] })).toThrow(/needs a "\{\{body\}\}"/);
    expect(() => parseBackend({ name: 'x', endpoints: [{ id: 'a', type: 'static', method: 'GET', path: '/a', body: { template: 'ghost' } }] })).toThrow(/no response template named "ghost"/);
    expect(() => parseBackend({ name: 'x', responses: { error: { format: 'custom' } } })).toThrow(/needs a template/);
    expect(() => parseBackend({ name: 'x', responseTemplates: { 'bad name': { body: 1 } } })).toThrow();
    expect(BackendSchema.safeParse({ name: 'x' }).success).toBe(true);
  });
});

describe('AC-LP-6 the error format', () => {
  const errors = (error: NonNullable<BackendInput['responses']>['error']): BackendInput => definition({ responses: { error } });

  it('AC-LP-6 keeps problem+json by default', async () => {
    const { url } = await serve(definition());
    const response = await fetch(`${url}/nope`);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await json(response)).toMatchObject({ status: 404 });
  });

  it('AC-LP-6 answers dummyjson errors as { message } for 400, 401, 404, 405 and 429', async () => {
    const { url } = await serve(errors({ format: 'dummyjson' }));
    const bad = await fetch(`${url}/checked`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toContain('application/json');
    expect(bad.headers.get('content-type')).not.toContain('problem');
    expect(Object.keys(await json(bad))).toEqual(['message']);
    const unauthorized = await fetch(`${url}/secure`);
    expect(unauthorized.status).toBe(401);
    expect(await json(unauthorized)).toEqual({ message: 'Invalid or expired token' });
    expect(await json(await fetch(`${url}/nope`))).toMatchObject({ message: expect.stringContaining('/nope') });
    const wrongMethod = await fetch(`${url}/config`, { method: 'POST' });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('GET');
    const limited = await fetch(`${url}/boom`, { headers: { 'x-tempo-scenario': 'rate' } });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('9');
    expect(Object.keys(await json(limited))).toEqual(['message']);
  });

  it('AC-LP-6 fills {{status}}, {{message}} and {{errors}} of a custom template', async () => {
    const { url } = await serve(errors({ format: 'custom', template: { success: false, code: '{{status}}', error: { message: '{{message}}', details: '{{errors}}' }, label: 'HTTP {{status}}' } }));
    const bad = await json(await fetch(`${url}/checked`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    expect(bad).toMatchObject({ success: false, code: 400, label: 'HTTP 400' });
    expect((bad.error as { details: { path: string }[] }).details[0]?.path).toContain('name');
    const missing = await json(await fetch(`${url}/nope`));
    expect(missing).toMatchObject({ code: 404, error: { details: [] } });
  });

  it('AC-LP-6 does not touch an error body the definition wrote (a scenario body)', async () => {
    const { url } = await serve(errors({ format: 'dummyjson' }));
    const own = await fetch(`${url}/boom`, { headers: { 'x-tempo-scenario': 'custom' } });
    expect(own.status).toBe(409);
    expect(await json(own)).toEqual({ mine: true });
  });
});

describe('AC-LP-6 common headers', () => {
  it('AC-LP-6 adds the backend headers to every answer and lets the endpoint and the answer override them', async () => {
    const { url } = await serve(definition({ responses: { headers: { 'x-backend': 'b', 'x-endpoint': 'backend', 'x-own': 'backend', 'cache-control': 'no-store' } } }));
    const config = await fetch(`${url}/config`);
    expect(config.headers.get('x-backend')).toBe('b');
    expect(config.headers.get('x-own')).toBe('static');
    expect(config.headers.get('cache-control')).toBe('no-store');
    const list = await fetch(`${url}/items`);
    expect(list.headers.get('x-endpoint')).toBe('crud');
    expect(list.headers.get('x-backend')).toBe('b');
    expect((await fetch(`${url}/nope`)).headers.get('x-backend')).toBe('b');
  });

  it('AC-LP-6 drops header names it cannot send and the ones the server sets itself', async () => {
    const { url } = await serve(definition({ responses: { headers: { 'content-length': '1', 'bad name': 'x', 'x-ok': 'yes' } } }));
    const response = await fetch(`${url}/config`);
    expect(response.headers.get('x-ok')).toBe('yes');
    expect(await json(response)).toEqual({ theme: 'dark' });
  });
});

describe('AC-LP-6 response templates', () => {
  const templates: BackendInput = definition({
    responseTemplates: {
      user: { status: 201, headers: { 'x-template': 'user' }, body: { id: '{{with.id}}', name: '{{with.name}}', label: 'User {{with.name}}', note: '{{with.missing}}' } },
      gone: { status: 410, body: { gone: true } },
    },
    endpoints: [
      { id: 'made', type: 'static', method: 'GET', path: '/made', body: { template: 'user', with: { id: 7, name: 'Ada' } } },
      { id: 'forced', type: 'static', method: 'GET', path: '/forced', status: 202, body: { template: 'user', with: { id: 8, name: 'Bo' } } },
      { id: 'scen', type: 'static', method: 'GET', path: '/scen', body: { ok: 1 }, scenarios: { retired: { body: { template: 'gone' } }, ownStatus: { status: 418, body: { template: 'gone' } } } },
    ],
  });

  it('AC-LP-6 fills {{with.x}} (whole-string values keep their type, missing is null), and takes the template status and headers', async () => {
    const { url } = await serve(templates);
    const response = await fetch(`${url}/made`);
    expect(response.status).toBe(201);
    expect(response.headers.get('x-template')).toBe('user');
    expect(await json(response)).toEqual({ id: 7, name: 'Ada', label: 'User Ada', note: null });
  });

  it('AC-LP-6 lets the endpoint status win when it is not the default 200', async () => {
    const { url } = await serve(templates);
    expect((await fetch(`${url}/forced`)).status).toBe(202);
  });

  it('AC-LP-6 uses a template in a scenario body, the scenario status winning over the template status', async () => {
    const { url } = await serve(templates);
    const retired = await fetch(`${url}/scen`, { headers: { 'x-tempo-scenario': 'retired' } });
    expect(retired.status).toBe(410);
    expect(await json(retired)).toEqual({ gone: true });
    expect((await fetch(`${url}/scen`, { headers: { 'x-tempo-scenario': 'ownStatus' } })).status).toBe(418);
  });

  it('AC-LP-6 a body that merely has a "template" key among others is plain data', async () => {
    const { url } = await serve(definition({ endpoints: [{ id: 'a', type: 'static', method: 'GET', path: '/a', body: { template: 'x', other: 1 } }] }));
    expect(await json(await fetch(`${url}/a`))).toEqual({ template: 'x', other: 1 });
  });
});

describe('AC-LP-6 OpenAPI and the contract check see the wrapper', () => {
  const wrapped = (): ReturnType<typeof parseBackend> =>
    parseBackend(definition({ responses: { success: WRAPPER, error: { format: 'dummyjson' } }, endpoints: [{ id: 'config', type: 'static', method: 'GET', path: '/config', body: { theme: 'dark' } }, { id: 'raw', type: 'static', method: 'GET', path: '/raw', wrap: 'none', body: { theme: 'dark' } }] }));

  it('AC-LP-6 wraps the success schema and example, and leaves wrap: none alone', () => {
    const paths = buildOpenApi(wrapped()).paths as Record<string, { get: { responses: Record<string, { content: Record<string, { schema: unknown; example?: unknown }> }> } }>;
    const ok = paths['/config']?.get.responses['200']?.content['application/json'];
    expect(ok?.schema).toMatchObject({ type: 'object', required: ['success', 'data', 'message'], properties: { success: { type: 'boolean' }, message: { type: 'null' }, data: { type: 'object', properties: { theme: { type: 'string' } } } } });
    expect(ok?.example).toEqual({ success: true, data: { theme: 'dark' }, message: null });
    expect(paths['/raw']?.get.responses['200']?.content['application/json']?.schema).toMatchObject({ type: 'object', properties: { theme: { type: 'string' } } });
  });

  it('AC-LP-6 describes the error format instead of problem+json', () => {
    const document = buildOpenApi(wrapped()) as { components: { schemas: { Problem: unknown } } };
    expect(document.components.schemas.Problem).toMatchObject({ type: 'object', required: ['message'] });
    expect(JSON.stringify(document)).not.toContain('application/problem+json');
  });

  it('AC-LP-6 the contract check finds a wrapped backend different from an unwrapped file, and equal to its own document', () => {
    const plain = parseBackend(definition({ endpoints: [{ id: 'config', type: 'static', method: 'GET', path: '/config', body: { theme: 'dark' } }] }));
    const unwrappedFile = buildOpenApi(plain) as Record<string, unknown>;
    const withWrapper = parseBackend(definition({ responses: { success: WRAPPER }, endpoints: [{ id: 'config', type: 'static', method: 'GET', path: '/config', body: { theme: 'dark' } }] }));
    expect(checkContract(withWrapper, unwrappedFile).differences.length).toBeGreaterThan(0);
    expect(checkContract(withWrapper, buildOpenApi(withWrapper) as Record<string, unknown>).ok).toBe(true);
    expect(checkContract(plain, unwrappedFile).ok).toBe(true);
  });
});

describe('AC-LP-6 the Tempo template preset stays unwrapped (C13)', () => {
  const TEMPLATE_OPENAPI = resolve(import.meta.dirname, 'fixtures/template-openapi.json');
  const template = JSON.parse(readFileSync(TEMPLATE_OPENAPI, 'utf8')) as Record<string, unknown>;

  it('AC-LP-6 sets wrap: none on every endpoint, so a backend wrapper does not change it, and the contract check still passes', () => {
    const input = structuredClone(presetDefinition('t', 'tempo-template')) as { endpoints: { wrap?: string }[]; responses?: unknown };
    expect(input.endpoints.every((endpoint) => endpoint.wrap === 'none')).toBe(true);
    input.responses = { success: WRAPPER, error: { format: 'dummyjson' } };
    // Success answers stay unwrapped, so the shapes still match the template's openapi.json.
    const report = checkContract(parseBackend(input), template);
    expect(report.differences).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('AC-LP-6 serves the preset answers unwrapped even with a wrapper configured', async () => {
    const dir = join(tempDir(), 'backend');
    createBackend(dir, { name: 'Tempo template', preset: 'tempo-template' });
    const file = join(dir, 'backend.json');
    const input = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    input.responses = { success: WRAPPER };
    writeFileSync(file, JSON.stringify(input));
    const backend = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, watch: false });
    try {
      const login = await fetch(`http://127.0.0.1:${backend.port}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }) });
      expect(login.status).toBe(200);
      const body = (await login.json()) as Record<string, unknown>;
      expect(body.accessToken).toBeTypeOf('string');
      expect(body.success).toBeUndefined();
    } finally {
      await backend.stop();
    }
  });
});

describe('AC-LP-6 the responses settings page', () => {
  const next = { responses: { success: WRAPPER, error: { format: 'dummyjson' }, headers: { 'x-team': 'a' } }, responseTemplates: { envelope: { body: { data: '{{body}}' } } } };

  it('AC-LP-6 PUT /settings/responses needs the admin role, is audited, and a bad wrapper is a 400', async () => {
    const site = await startSite();
    const editor = await member(site, 'ed@example.com', 'editor');
    const viewer = await member(site, 'view@example.com', 'viewer');
    const admin = await member(site, 'adm@example.com', 'admin');
    expect((await editor.admin('demo', 'PUT', '/settings/responses', next)).status).toBe(403);
    expect((await viewer.admin('demo', 'PUT', '/settings/responses', next)).status).toBe(403);
    expect((await viewer.admin('demo', 'GET', '/settings/responses')).status).toBe(200);
    const bad = await admin.admin('demo', 'PUT', '/settings/responses', { responses: { success: { nothing: true } } });
    expect(bad.status).toBe(400);
    expect(bad.body).toContain('{{body}}');
    const saved = await admin.admin('demo', 'PUT', '/settings/responses', next);
    expect(saved.status, saved.body).toBe(200);
    expect(saved.json()).toEqual(next);
    const log = await site.owner.hub('GET', '/backends/demo/audit?action=PUT');
    const entries = (log.json() as { entries: { actor: { label: string }; action: string; denied: boolean; status: number }[] }).entries.filter((entry) => entry.action === 'PUT /settings/responses');
    expect(entries.map((entry) => [entry.actor.label, entry.denied, entry.status])).toEqual(expect.arrayContaining([['adm@example.com', false, 200], ['ed@example.com', true, 403]]));
    // It is live: the public API now wraps.
    const answer = await fetch(`http://127.0.0.1:${String(site.team.port)}/b/demo/products/1`);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ success: true, data: { id: 1 } });
    expect(answer.headers.get('x-team')).toBe('a');
  });

  it('AC-LP-6 an editor cannot change the wrapper through PUT /definition', async () => {
    const site = await startSite();
    const editor = await member(site, 'ed@example.com', 'editor');
    const current = (await editor.admin('demo', 'GET', '/definition')).json();
    const denied = await editor.admin('demo', 'PUT', '/definition', { ...current, ...next });
    expect(denied.status).toBe(403);
  });
});
