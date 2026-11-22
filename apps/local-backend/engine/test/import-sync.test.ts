import { afterEach, describe, expect, it } from 'vitest';

import { json, serve, stopAll } from './helpers.ts';
import { fixture } from './import-helpers.ts';

afterEach(stopAll);

type Doc = {
  paths: Record<string, Record<string, { responses: Record<string, unknown>; [key: string]: unknown }>>;
  definitions: Record<string, { required?: string[]; properties: Record<string, unknown> }>;
  [key: string]: unknown;
};
/** The petstore file after the API changed: a new endpoint, one removed, a new 429 on the list and a new required body field. */
function changedFile(): string {
  const doc = JSON.parse(fixture('petstore-swagger2.json')) as Doc;
  delete doc.paths['/pets/{petId}']?.delete;
  doc.paths['/stores'] = {
    get: { operationId: 'listStores', tags: ['stores'], responses: { '200': { description: 'Stores', schema: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } } } } },
  };
  doc.paths['/pets']!.get!.responses['429'] = { description: 'Too many requests', schema: { $ref: '#/definitions/Error' } };
  const newPet = doc.definitions.NewPet;
  if (newPet !== undefined) {
    newPet.required = ['name', 'age'];
    newPet.properties.age = { type: 'integer' };
  }
  return JSON.stringify(doc);
}

interface Entry {
  id: string;
  customized?: boolean;
  changes?: string[];
}
interface Preview {
  diff: { added: Entry[]; removed: Entry[]; changed: Entry[]; unchanged: Entry[]; skipped: { id: string }[] };
  warnings: string[];
  total: number;
  byTag: Record<string, number>;
  firstImport: boolean;
  hash: string;
}

async function setup() {
  const { backend, url } = await serve({ name: 'shop' });
  const admin = `http://127.0.0.1:${String(backend.admin.port)}/__admin`;
  const send = (path: string, method: string, body?: unknown): Promise<Response> =>
    fetch(`${admin}${path}`, { method, headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const preview = async (text: string): Promise<Preview> => {
    const answer = await send('/import/preview', 'POST', { text, name: 'petstore.json' });
    expect(answer.status).toBe(200);
    return (await answer.json()) as Preview;
  };
  const apply = async (text: string, choices?: unknown, expectHash?: string): Promise<Response> => send('/import/apply', 'POST', { text, name: 'petstore.json', ...(choices === undefined ? {} : { choices }), ...(expectHash === undefined ? {} : { expectHash }) });
  const endpoint = async (id: string): Promise<Record<string, unknown>> => json(await send(`/endpoints/${encodeURIComponent(id)}`, 'GET'));
  const edit = async (id: string, change: (endpoint: Record<string, unknown>) => void): Promise<void> => {
    const current = await endpoint(id);
    change(current);
    const saved = await send(`/endpoints/${encodeURIComponent(id)}`, 'PUT', current);
    expect(saved.status, JSON.stringify(await saved.clone().json())).toBe(200);
  };
  const ids = (entries: Entry[]): string[] => entries.map((entry) => entry.id).sort();
  return { backend, url, send, preview, apply, endpoint, edit, ids };
}

describe('AC-LP-5 previewing an import', () => {
  it('AC-LP-5 counts endpoints per tag, lists warnings and writes nothing', async () => {
    const { backend, preview } = await setup();
    const result = await preview(fixture('petstore-swagger2.json'));
    expect(result.firstImport).toBe(true);
    expect(result.total).toBe(5);
    expect(result.byTag).toEqual({ pets: 4, photos: 1 });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.diff.added).toHaveLength(5);
    expect(backend.manager.definition().endpoints ?? []).toHaveLength(0);
    expect(backend.manager.definition().imports ?? []).toHaveLength(0);
  });

  it('AC-LP-5 refuses a file that is not an API description with a 400', async () => {
    const { send } = await setup();
    const answer = await send('/import/preview', 'POST', { text: '{"x":1}', name: 'x.json' });
    expect(answer.status).toBe(400);
    expect(String((await answer.json() as { detail: string }).detail)).toContain('neither');
    expect((await send('/import/preview', 'POST', {})).status).toBe(400);
  });
});

describe('AC-LP-5 re-importing a changed file', () => {
  it('AC-LP-5 shows added, removed, changed and unchanged, and flags an edited endpoint as customized', async () => {
    const { apply, edit, preview, ids } = await setup();
    expect((await apply(fixture('petstore-swagger2.json'))).status).toBe(200);
    expect((await preview(fixture('petstore-swagger2.json'))).diff.unchanged).toHaveLength(5);
    await edit('listPets', (endpoint) => void (endpoint.body = [{ id: 99, name: 'Mine' }]));
    const result = await preview(changedFile());
    expect(result.firstImport).toBe(false);
    expect(ids(result.diff.added)).toEqual(['listStores']);
    expect(ids(result.diff.removed)).toEqual(['deletePet']);
    expect(ids(result.diff.changed)).toEqual(['createPet', 'listPets']);
    expect(ids(result.diff.unchanged)).toEqual(['get.pets.:petId', 'uploadPhoto']);
    const list = result.diff.changed.find((entry) => entry.id === 'listPets');
    const create = result.diff.changed.find((entry) => entry.id === 'createPet');
    expect(list?.customized).toBe(true);
    expect(list?.changes).toContain('scenario added: 429 tooManyRequests');
    expect(create?.customized).toBe(false);
    expect(create?.changes).toContain('request.body');
    expect(create?.changes?.some((change) => change.startsWith('response schema'))).toBe(false);
  });

  it('AC-LP-5 saving an endpoint without a real change does not count as customizing it', async () => {
    const { apply, edit, preview, ids } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    await edit('listPets', (endpoint) => {
      endpoint.auth = 'none';
      endpoint.headers = {};
    });
    const result = await preview(fixture('petstore-swagger2.json'));
    expect(result.diff.unchanged.find((entry) => entry.id === 'listPets')?.customized).toBe(false);
    expect(ids(result.diff.changed)).toEqual([]);
  });

  it('AC-LP-5 by default keeps what you edited, takes the rest, adds new endpoints and deletes nothing', async () => {
    const { apply, edit, endpoint, preview, url } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    await edit('listPets', (current) => void (current.body = [{ id: 99, name: 'Mine' }]));
    const answer = await apply(changedFile());
    expect(answer.status).toBe(200);
    const result = (await answer.json()) as { applied: { added: string[]; removed: string[]; taken: string[]; kept: string[] } };
    expect(result.applied).toMatchObject({ added: ['listStores'], removed: [], taken: ['createPet'], kept: ['listPets'] });
    expect(await (await fetch(`${url}/v2/pets`)).json()).toEqual([{ id: 99, name: 'Mine' }]);
    expect((await fetch(`${url}/v2/stores`)).status).toBe(200);
    expect((await fetch(`${url}/v2/pets/1`, { method: 'DELETE' })).status).toBe(204);
    // keep-mine did not add the new scenario...
    expect(Object.keys((await endpoint('listPets')).scenarios as object)).not.toContain('429 tooManyRequests');
    // ...and the same file is not offered again as a change, but the endpoint still shows as customized.
    const again = await preview(changedFile());
    expect(again.diff.changed.map((entry) => entry.id)).toEqual([]);
    expect(again.diff.unchanged.find((entry) => entry.id === 'listPets')?.customized).toBe(true);
  });

  it('AC-LP-5 merge adds the new scenario and schemas but keeps your body, status and delays', async () => {
    const { apply, edit, endpoint, url } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    await edit('listPets', (current) => {
      current.body = [{ id: 99, name: 'Mine' }];
      const scenarios = current.scenarios as Record<string, Record<string, unknown>>;
      const key = Object.keys(scenarios)[0] ?? '';
      scenarios[key] = { ...scenarios[key], delayMs: 5, body: [{ id: 5, name: 'Slow mine' }] };
    });
    const answer = await apply(changedFile(), { change: { listPets: 'merge' } });
    expect(answer.status).toBe(200);
    const merged = await endpoint('listPets');
    const scenarios = merged.scenarios as Record<string, { body?: unknown; delayMs?: number; schema?: unknown }>;
    expect(Object.keys(scenarios)).toContain('429 tooManyRequests');
    expect(scenarios['429 tooManyRequests']?.schema).toMatchObject({ type: 'object' });
    expect(scenarios['200 aListOfPets']).toMatchObject({ delayMs: 5, body: [{ id: 5, name: 'Slow mine' }] });
    expect(merged.body).toEqual([{ id: 99, name: 'Mine' }]);
    expect((await fetch(`${url}/v2/pets`, { headers: { 'x-tempo-scenario': '429 tooManyRequests' } })).status).toBe(429);
  });

  it('AC-LP-5 take-new replaces an edited endpoint, and the choices can remove and skip endpoints', async () => {
    const { apply, edit, endpoint, url, send } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    await edit('listPets', (current) => void (current.body = [{ id: 99, name: 'Mine' }]));
    const answer = await apply(changedFile(), { change: { listPets: 'take-new' }, remove: { deletePet: true }, add: { listStores: false } });
    const result = (await answer.json()) as { applied: { added: string[]; removed: string[]; taken: string[] } };
    expect(result.applied).toMatchObject({ added: [], removed: ['deletePet'] });
    expect([...result.applied.taken].sort()).toEqual(['createPet', 'listPets']);
    expect(await (await fetch(`${url}/v2/pets`)).json()).toEqual([{ id: 1, name: 'Rex' }]);
    expect((await send('/endpoints/deletePet', 'GET')).status).toBe(404);
    expect((await fetch(`${url}/v2/stores`)).status).toBe(404);
    expect(Object.keys((await endpoint('listPets')).scenarios as object)).toContain('429 tooManyRequests');
  });

  it('AC-LP-5 never removes an endpoint that was not imported, and leaves a clashing route out', async () => {
    const { apply, send, preview, ids, backend } = await setup();
    await send('/endpoints', 'POST', { id: 'mine', type: 'static', method: 'GET', path: '/stores', body: { mine: true } });
    await apply(fixture('petstore-swagger2.json'));
    const result = await preview(changedFile());
    expect(ids(result.diff.removed)).toEqual(['deletePet']);
    expect(result.diff.skipped.map((entry) => entry.id)).toEqual(['listStores']);
    await apply(changedFile(), { remove: { deletePet: true, mine: true } });
    expect((backend.manager.definition().endpoints ?? []).map((entry) => entry.id)).toContain('mine');
  });

  it('AC-LP-5 refuses to apply when the file is not the one that was previewed, and an unknown choice', async () => {
    const { apply, preview } = await setup();
    const first = await preview(fixture('petstore-swagger2.json'));
    expect((await apply(changedFile(), undefined, first.hash)).status).toBe(409);
    expect((await apply(fixture('petstore-swagger2.json'), undefined, first.hash)).status).toBe(200);
    const bad = await apply(changedFile(), { change: { listPets: 'overwrite' } });
    expect(bad.status).toBe(400);
  });

  it('AC-LP-5 keeps a history of imports', async () => {
    const { apply, backend } = await setup();
    await apply(fixture('petstore-swagger2.json'));
    await apply(changedFile());
    const records = backend.manager.definition().imports ?? [];
    expect(records).toHaveLength(2);
    expect(records[0]?.hash).not.toBe(records[1]?.hash);
  });
});
