import { request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { adminRouteList } from '../src/admin.ts';
import { crudEndpoints } from '../src/folder.ts';
import type { BackendInput } from '../src/schema.ts';

import { json, serve, stopAll } from './helpers.ts';

afterEach(stopAll);

const definition: BackendInput = {
  name: 'admin',
  collections: [{ name: 'notes', fields: [{ name: 'text', type: 'string', required: true }], seed: [{ text: 'one' }] }],
  endpoints: crudEndpoints('notes', { basePath: '/notes' }),
};

async function setup(extra: Parameters<typeof serve>[1] = {}) {
  const { backend, url, dir } = await serve(definition, extra);
  const admin = `http://127.0.0.1:${backend.admin.port}`;
  const call = (path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`${admin}/__admin${path}`, {
      ...init,
      headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
    });
  const send = (path: string, method: string, body?: unknown): Promise<Response> =>
    call(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { backend, url, dir, admin, call, send };
}

describe('admin channel isolation (AC-LB-6)', () => {
  it('the public listener 404s every admin route, with or without the token', async () => {
    const { url, backend } = await setup();
    for (const entry of adminRouteList()) {
      const [method, path] = entry.split(' ') as [string, string];
      for (const headers of [{}, { authorization: `Bearer ${backend.admin.token}` }]) {
        const response = await fetch(`${url}${path}`, { method, headers });
        expect(response.status, `${entry} on the public port`).toBe(404);
      }
    }
    // Encoded and doubled slashes do not get around it either.
    expect((await fetch(`${url}//__admin/definition`)).status).toBe(404);
    expect((await fetch(`${url}/__admin/definition/`)).status).toBe(404);
  });

  it('serves /__health publicly and nothing else under /__', async () => {
    const { url } = await setup();
    expect(await json(await fetch(`${url}/__health`))).toMatchObject({ ok: true, name: 'admin' });
    expect((await fetch(`${url}/__other`)).status).toBe(404);
  });

  it('binds the admin listener to 127.0.0.1 on its own port and asks for the token', async () => {
    const { backend, admin } = await setup();
    expect(backend.admin.port).not.toBe(backend.port);
    expect(backend.admin.token).toMatch(/^[0-9a-f]{64}$/);
    expect((await fetch(`${admin}/__admin/definition`)).status).toBe(401);
    expect((await fetch(`${admin}/__admin/definition`, { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await fetch(`${admin}/__admin/definition`, { headers: { 'x-tempo-token': backend.admin.token } })).status).toBe(200);
  });

  it('refuses a request whose Host is not loopback', async () => {
    const { backend } = await setup();
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: backend.admin.port, path: '/__admin/definition', headers: { host: 'evil.example', authorization: `Bearer ${backend.admin.token}` } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  it('the public listener does not serve the admin token anywhere', async () => {
    const { url, backend } = await setup();
    for (const path of ['/notes', '/__health']) {
      const text = await (await fetch(`${url}${path}`)).text();
      expect(text).not.toContain(backend.admin.token);
    }
  });
});

describe('admin API', () => {
  it('gets and puts the full definition', async () => {
    const { call, send, url } = await setup();
    const current = (await json(await call('/definition'))) as BackendInput;
    expect(current.name).toBe('admin');
    const response = await send('/definition', 'PUT', { ...current, endpoints: [...(current.endpoints ?? []), { id: 'ping', type: 'static', method: 'GET', path: '/ping', body: { pong: true } }] });
    expect(response.status).toBe(200);
    expect(await json(await fetch(`${url}/ping`))).toEqual({ pong: true });
    const invalid = await send('/definition', 'PUT', { name: 'x', port: 'no' });
    expect(invalid.status).toBe(400);
    expect(((await json(invalid)).errors as { path: string }[])[0]?.path).toBe('port');
  });

  it('browses and edits rows (AC-LB-3: the API sees them immediately)', async () => {
    const { send, call, url } = await setup();
    const created = await send('/data/notes', 'POST', { text: 'from the data tab' });
    expect(created.status).toBe(201);
    const id = (await json(created)).id;
    expect(await json(await fetch(`${url}/notes/${String(id)}`))).toMatchObject({ text: 'from the data tab' });
    await send(`/data/notes/${String(id)}`, 'PATCH', { text: 'edited' });
    expect(await json(await fetch(`${url}/notes/${String(id)}`))).toMatchObject({ text: 'edited' });
    const page = await json(await call('/data/notes?limit=1&skip=1&sort=-id'));
    expect(page).toMatchObject({ total: 2, skip: 1, limit: 1 });
    expect((await send(`/data/notes/${String(id)}`, 'DELETE')).status).toBe(200);
    expect((await fetch(`${url}/notes/${String(id)}`)).status).toBe(404);
    expect((await send('/data/notes', 'POST', { nope: 1 })).status).toBe(400);
    expect((await send('/data/missing', 'POST', {})).status).toBe(404);
  });

  it('sets and clears scenarios', async () => {
    const { send, call, url } = await setup();
    expect((await send('/scenarios/notes.list', 'PUT', { name: 'serverError' })).status).toBe(200);
    expect((await fetch(`${url}/notes`)).status).toBe(500);
    expect(await json(await call('/scenarios'))).toMatchObject({ active: { 'notes.list': 'serverError' } });
    expect((await send('/scenarios/notes.list', 'PUT', { name: 'bogus' })).status).toBe(400);
    await send('/scenarios', 'DELETE');
    expect((await fetch(`${url}/notes`)).status).toBe(200);
  });

  it('answers 404 and 405 for unknown admin routes', async () => {
    const { call } = await setup();
    expect((await call('/nothing')).status).toBe(404);
    expect((await call('/definition', { method: 'DELETE' })).status).toBe(405);
  });
});
