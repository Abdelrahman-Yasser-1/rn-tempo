import { afterEach, describe, expect, it } from 'vitest';

import type { BackendInput } from '../src/schema.ts';

import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const definition: BackendInput = {
  name: 'static',
  endpoints: [
    {
      id: 'config',
      type: 'static',
      method: 'GET',
      path: '/app-config',
      status: 200,
      headers: { 'x-config-version': '7' },
      body: { minVersion: '1.2.0' },
      scenarios: {
        maintenance: { status: 503, body: { maintenance: true } },
        blank: { status: 204 },
        slow: { delayMs: 250 },
        teapot: { status: 418, headers: { 'x-tea': 'yes' } },
      },
    },
    { id: 'secure', type: 'static', method: 'GET', path: '/me', auth: 'bearer', body: { id: 1 } },
  ],
};

describe('static endpoints', () => {
  it('serves a fixed status, headers and JSON body', async () => {
    const { url } = await serve(definition);
    const response = await fetch(`${url}/app-config`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-config-version')).toBe('7');
    expect(await json(response)).toEqual({ minVersion: '1.2.0' });
  });

  it('checks that a bearer token is present on a bearer endpoint', async () => {
    const { url } = await serve(definition);
    expect((await fetch(`${url}/me`)).status).toBe(401);
    expect((await fetch(`${url}/me`, { headers: { authorization: 'Bearer abc' } })).status).toBe(200);
  });
});

describe('scenarios', () => {
  it('are picked with the x-tempo-scenario header', async () => {
    const { url } = await serve(definition);
    const response = await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'maintenance' } });
    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({ maintenance: true });
    expect((await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'blank' } })).status).toBe(204);
    const teapot = await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'teapot' } });
    expect(teapot.status).toBe(418);
    expect(teapot.headers.get('x-tea')).toBe('yes');
    expect(teapot.headers.get('content-type')).toContain('application/problem+json');
  });

  it('include the built-in ones, and an unknown name is a 400 listing the options', async () => {
    const { url } = await serve(definition);
    expect((await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'notFound' } })).status).toBe(404);
    expect((await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'serverError' } })).status).toBe(500);
    const unknown = await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'nope' } });
    expect(unknown.status).toBe(400);
    expect(String((await json(unknown)).detail)).toContain('maintenance');
  });

  it('delay before answering normally', async () => {
    const { url } = await serve(definition);
    const started = Date.now();
    const response = await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'slow' } });
    expect(Date.now() - started).toBeGreaterThanOrEqual(240);
    expect(await json(response)).toEqual({ minVersion: '1.2.0' });
  });

  it('can be set on the engine until cleared, and the header wins', async () => {
    const { url, backend } = await serve(definition);
    expect(backend.engine.setScenario('config', 'maintenance')).toBe(true);
    expect(backend.engine.setScenario('config', 'nope')).toBe(false);
    expect(backend.engine.setScenario('missing', 'maintenance')).toBe(false);
    expect((await fetch(`${url}/app-config`)).status).toBe(503);
    expect((await fetch(`${url}/app-config`, { headers: { 'x-tempo-scenario': 'blank' } })).status).toBe(204);
    backend.engine.clearScenario('config');
    expect((await fetch(`${url}/app-config`)).status).toBe(200);
  });

  it('apply to crud endpoints too', async () => {
    const { url } = await serve({
      name: 'c',
      collections: [{ name: 'things', fields: [{ name: 'n', type: 'string' }] }],
      endpoints: [{ id: 'list', type: 'crud', collection: 'things', action: 'list', method: 'GET', path: '/things', scenarios: { empty: { body: { things: [], total: 0 } } } }],
    });
    expect(await json(await fetch(`${url}/things`, { headers: { 'x-tempo-scenario': 'empty' } }))).toEqual({ things: [], total: 0 });
  });
});
