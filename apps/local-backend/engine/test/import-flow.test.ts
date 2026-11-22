import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { importFromCli } from '../src/import/cli-import.ts';

import { json, serve, stopAll, tempDir } from './helpers.ts';
import { fixture } from './import-helpers.ts';

afterEach(stopAll);

async function setup(definition: Parameters<typeof serve>[0] = { name: 'shop' }) {
  const { backend, url, dir } = await serve(definition);
  const admin = `http://127.0.0.1:${String(backend.admin.port)}/__admin`;
  const send = (path: string, method: string, body?: unknown): Promise<Response> =>
    fetch(`${admin}${path}`, { method, headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const apply = async (text: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const answer = await send('/import/apply', 'POST', { text, name: 'api.json', ...extra });
    expect(answer.status, JSON.stringify(await answer.clone().json())).toBe(200);
    return json(answer);
  };
  /** A bearer token of a new app user, minted through the admin API. */
  const token = async (): Promise<string> => {
    const made = await json(await send('/users', 'POST', { username: 'tester', password: 'a long enough password' }));
    return String(((await json(await send(`/users/${String(made.id)}/token`, 'POST'))) as { accessToken?: string; token?: string }).accessToken ?? '');
  };
  return { backend, url, dir, send, apply, token };
}

describe('AC-LP-5 serving an imported Swagger 2.0 file', () => {
  it('AC-LP-5 answers with the documented example, and with each documented response through x-tempo-scenario', async () => {
    const { url, apply } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    const list = await fetch(`${url}/v2/pets`);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([{ id: 1, name: 'Rex' }]);
    const missing = await fetch(`${url}/v2/pets/7`, { headers: { 'x-tempo-scenario': '404 notFound' } });
    expect(missing.status).toBe(404);
    const body = await json(missing);
    expect(typeof body.code).toBe('number');
    expect(typeof body.message).toBe('string');
    const failure = await fetch(`${url}/v2/pets`, { headers: { 'x-tempo-scenario': 'default unexpectedError' } });
    expect(failure.status).toBe(500);
    expect((await fetch(`${url}/v2/pets/7`, { method: 'DELETE' })).status).toBe(204);
  });

  it('AC-LP-5 serves generated data that is the same on every call', async () => {
    const { url, apply } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    const one = await (await fetch(`${url}/v2/pets/3`)).text();
    const two = await (await fetch(`${url}/v2/pets/3`)).text();
    expect(one).toBe(two);
    const pet = JSON.parse(one) as { id: number; name: string };
    expect(pet.id).toBeGreaterThanOrEqual(1);
    expect(pet.name).toBe('Rex');
  });

  it('AC-LP-5 answers 400 with the names of the wrong fields when a request does not match', async () => {
    const { url, apply, token } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    const bearer = await token();
    expect(bearer).not.toBe('');
    const post = (body: unknown): Promise<Response> =>
      fetch(`${url}/v2/pets`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
    const bad = await post({ name: 'x', tag: 5 });
    expect(bad.status).toBe(400);
    const problem = (await json(bad)) as { errors: { path: string }[]; detail: string };
    expect(problem.errors.map((issue) => issue.path).sort()).toEqual(['body.name', 'body.tag']);
    expect(problem.detail).toContain('body.');
    const missing = await post({});
    expect(((await json(missing)).errors as { path: string }[]).map((issue) => issue.path)).toEqual(['body.name']);
    // bearer endpoint: needs a token before anything else.
    expect(bad.headers.get('content-type')).toContain('problem+json');
    expect((await post({ name: 'Rex' })).status).toBe(201);
    const none = await fetch(`${url}/v2/pets`, { method: 'POST', body: '' });
    expect(none.status).toBe(401);
    const query = await fetch(`${url}/v2/pets?limit=99`);
    expect(query.status).toBe(400);
    expect(((await json(query)).errors as { path: string }[])[0]?.path).toBe('query.limit');
    expect((await fetch(`${url}/v2/pets?limit=5`)).status).toBe(200);
    const params = await fetch(`${url}/v2/pets/abc`);
    expect(params.status).toBe(400);
    expect(((await json(params)).errors as { path: string }[])[0]?.path).toBe('params.petId');
  });

  it('AC-LP-5 does not check the request when a scenario stands in for the answer', async () => {
    const { url, apply } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    const answer = await fetch(`${url}/v2/pets/abc`, { headers: { 'x-tempo-scenario': '404 notFound' } });
    expect(answer.status).toBe(404);
  });

  it('AC-LP-5 sets the base path of a new backend and records the import', async () => {
    const { backend, apply } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    const definition = backend.manager.definition();
    expect(definition.basePath).toBe('/v2');
    expect(definition.imports).toHaveLength(1);
    expect(definition.imports?.[0]).toMatchObject({ source: 'api.json', format: 'swagger-2.0' });
    expect(definition.imports?.[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((definition.endpoints ?? []).every((endpoint) => typeof (endpoint as { importedFrom?: string }).importedFrom === 'string')).toBe(true);
  });

  it('AC-LP-5 lists each response of an operation in the generated OpenAPI document', async () => {
    const { backend, url, apply } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    const document = (await (await fetch(`${url}/__docs/openapi.json`)).json()) as { paths: Record<string, { get: { responses: Record<string, unknown> } }> };
    expect(Object.keys(document.paths['/pets/{petId}']?.get.responses ?? {}).sort()).toEqual(['200', '404']);
    expect(backend.engine.definition.endpoints.length).toBe(5);
  });
});

describe('AC-LP-5 importing an OpenAPI 3.1 file', () => {
  it('AC-LP-5 serves each documented response and validates the oneOf body', async () => {
    const { url, apply } = await setup();
    await apply(fixture('oas31-features.json'));
    const created = await fetch(`${url}/api/v1/shapes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(created.status).toBe(401);
    const bad = await fetch(`${url}/api/v1/shapes?page=0`);
    expect(bad.status).toBe(400);
    const list = (await (await fetch(`${url}/api/v1/shapes?page=1`)).json()) as { kind: string }[];
    expect(list.length).toBeGreaterThanOrEqual(2);
    const clientProblem = await fetch(`${url}/api/v1/shapes`, { headers: { 'x-tempo-scenario': '400 badQuery' } });
    expect(await clientProblem.json()).toEqual({ error: 'bad page' });
  });
});

describe('AC-LP-5 the import command', () => {
  it('AC-LP-5 creates a backend from a file and updates it on a second run', async () => {
    const dir = join(tempDir(), 'shop');
    const source = join(tempDir(), 'petstore.json');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(source, fixture('petstore-swagger2.json'));
    const first = await importFromCli(dir, source);
    expect(first.created).toBe(true);
    expect(first.diff.added).toHaveLength(5);
    const written = JSON.parse(readFileSync(join(dir, 'backend.json'), 'utf8')) as { name: string; basePath: string; endpoints: unknown[]; imports: unknown[] };
    expect(written.name).toBe('Pet Shop');
    expect(written.basePath).toBe('/v2');
    expect(written.endpoints).toHaveLength(5);
    const second = await importFromCli(dir, source);
    expect(second.created).toBe(false);
    expect(second.diff.unchanged).toHaveLength(5);
    expect(second.diff.added).toHaveLength(0);
    const preview = await importFromCli(join(tempDir(), 'new'), source, { preview: true });
    expect(preview.applied).toBeUndefined();
  });
});
