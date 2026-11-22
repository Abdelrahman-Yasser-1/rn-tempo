import { describe, expect, it } from 'vitest';

import { generateFromSchema } from '../src/import/generate.ts';
import { importApiText, MAX_RESOLVED_NODES } from '../src/import/openapi.ts';
import { BackendSchema } from '../src/schema.ts';

import { fixture, refBomb, templateOpenApi } from './import-helpers.ts';

type Ep = ReturnType<typeof importApiText>['endpoints'][number];
const byId = (endpoints: Ep[], id: string): Ep => {
  const found = endpoints.find((endpoint) => endpoint.id === id);
  if (found === undefined) throw new Error(`no endpoint ${id}`);
  return found;
};
const scenarioNames = (endpoint: Ep): string[] => Object.keys((endpoint.scenarios ?? {}) as Record<string, unknown>);

describe('AC-LP-5 importing a Swagger 2.0 file', () => {
  const api = importApiText(fixture('petstore-swagger2.json'), 'petstore.json');

  it('AC-LP-5 detects the format and turns host, basePath and the title into a base path and a name', () => {
    expect(api.format).toBe('swagger-2.0');
    expect(api.title).toBe('Pet Shop');
    expect(api.basePath).toBe('/v2');
    expect(api.endpoints.map((endpoint) => endpoint.id).sort()).toEqual(['createPet', 'deletePet', 'get.pets.:petId', 'listPets', 'uploadPhoto']);
  });

  it('AC-LP-5 makes one scenario per documented response, named after its status and description, the first 2xx as default', () => {
    const list = byId(api.endpoints, 'listPets');
    expect(scenarioNames(list)).toEqual(['200 aListOfPets', 'default unexpectedError']);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id: 1, name: 'Rex' }]);
    const create = byId(api.endpoints, 'createPet');
    expect(scenarioNames(create)).toEqual(['201 created', '422 validationFailed']);
    expect(create.status).toBe(201);
    const one = byId(api.endpoints, 'get.pets.:petId');
    expect(scenarioNames(one)).toEqual(['200 thePet', '404 notFound']);
    const scenarios = one.scenarios as Record<string, { status: number; body: { code: number; message: string }; schema: unknown }>;
    expect(scenarios['404 notFound']?.status).toBe(404);
    expect(typeof scenarios['404 notFound']?.body.message).toBe('string');
    expect(scenarios['404 notFound']?.schema).toMatchObject({ type: 'object', required: ['code', 'message'] });
  });

  it('AC-LP-5 converts definitions, body, path, query and formData parameters and the path syntax', () => {
    const one = byId(api.endpoints, 'get.pets.:petId');
    expect(one.path).toBe('/pets/:petId');
    expect((one.request as { params: { required: string[] } }).params.required).toEqual(['petId']);
    expect((byId(api.endpoints, 'listPets').request as { query: { properties: { limit: { maximum: number } } } }).query.properties.limit.maximum).toBe(50);
    const create = byId(api.endpoints, 'createPet').request as { body: { required: string[]; properties: { name: { minLength: number } } }; bodyRequired: boolean };
    expect(create.body.required).toEqual(['name']);
    expect(create.body.properties.name.minLength).toBe(2);
    expect(create.bodyRequired).toBe(true);
    // A form upload is not a JSON body, so it is not validated (and says so).
    expect(byId(api.endpoints, 'uploadPhoto').request).toEqual({ params: expect.anything() });
    expect(api.warnings.join('\n')).toContain('not JSON');
    expect(api.warnings.join('\n')).toContain('Header and cookie parameters');
  });

  it('AC-LP-5 keeps the nested definitions, and turns x-nullable into a null type', () => {
    const pet = (byId(api.endpoints, 'createPet').scenarios as Record<string, { schema: { properties: { tag: { type: string[] }; owner: { properties: { email: { format: string } } } } } }>)['201 created']?.schema;
    expect(pet?.properties.tag.type).toEqual(['string', 'null']);
    expect(pet?.properties.owner.properties.email.format).toBe('email');
  });

  it('AC-LP-5 asks for sign-in where a security requirement applies, and warns that an API key is not supported', () => {
    expect(byId(api.endpoints, 'createPet').auth).toBe('bearer');
    expect(byId(api.endpoints, 'listPets').auth).toBeUndefined();
    expect(api.warnings.join('\n')).toContain('API key (bearer)');
  });

  it('AC-LP-5 makes endpoints the backend schema accepts', () => {
    const parsed = BackendSchema.safeParse({ name: 'x', endpoints: api.endpoints });
    expect(parsed.success).toBe(true);
  });
});

describe('AC-LP-5 importing OpenAPI 3.1', () => {
  const api = importApiText(fixture('oas31-features.json'), 'shapes.json');

  it('AC-LP-5 reads the base path, oneOf, nullable types, 4XX ranges, examples and a recursive $ref', () => {
    expect(api.format).toBe('openapi-3.1');
    expect(api.basePath).toBe('/api/v1');
    const list = byId(api.endpoints, 'listShapes');
    expect(scenarioNames(list)).toEqual(['200 shapes', '400 badQuery']);
    const shapes = list.body as { kind: string }[];
    expect(shapes.length).toBeGreaterThanOrEqual(2);
    expect(['circle', 'square']).toContain(shapes[0]?.kind);
    expect((list.scenarios as Record<string, { body: unknown }>)['400 badQuery']?.body).toEqual({ error: 'bad page' });
    const add = byId(api.endpoints, 'addShape');
    expect(scenarioNames(add)).toEqual(['201 created', '4XX clientProblem']);
    expect(add.body).toEqual({ kind: 'circle', radius: 3 });
    expect(add.auth).toBe('bearer');
    expect(typeof (byId(api.endpoints, 'getLabel').body)).toBe('string');
    const tree = byId(api.endpoints, 'getTree');
    expect(tree.auth).toBe('bearer');
    expect(api.warnings.join('\n')).toMatch(/recursive/);
  });

  it('AC-LP-5 lists what it skipped: webhooks, callbacks, and the API key', () => {
    const text = api.warnings.join('\n');
    expect(text).toContain('Webhooks');
    expect(text).toContain('Callbacks of POST /shapes');
    expect(text).toContain('API key (key)');
  });

  it('AC-LP-5 reads the same file as YAML', () => {
    const yaml = `openapi: 3.0.3
info: { title: Tiny, version: '1' }
paths:
  /things/{id}:
    get:
      summary: One thing
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema: { type: object, properties: { id: { type: integer }, note: { type: string, nullable: true } } }
`;
    const tiny = importApiText(yaml, 'tiny.yaml');
    const [thing] = tiny.endpoints;
    expect(thing?.path).toBe('/things/:id');
    expect(thing?.summary).toBe('One thing');
    expect(Object.keys(thing?.body as object)).toEqual(['id', 'note']);
    expect(importApiText(yaml, 'noextension').endpoints).toHaveLength(1);
    expect(() => importApiText('{ not: [valid', 'broken.yaml')).toThrow(/neither valid JSON nor valid YAML/);
  });

  it('AC-LP-5 refuses a file that is not an API description, and an unsupported version', () => {
    expect(() => importApiText('{"hello":1}', 'x.json')).toThrow(/neither "openapi" nor "swagger"/);
    expect(() => importApiText('{"openapi":"4.0.0"}', 'x.json')).toThrow(/not supported/);
    expect(() => importApiText('[1]', 'x.json')).toThrow(/expected a JSON or YAML object/);
  });
});

describe('AC-LP-5 importing the template\'s own openapi.json', () => {
  it('AC-LP-5 makes an endpoint per operation, with a scenario per documented response', () => {
    const doc = JSON.parse(templateOpenApi()) as { paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
    const operations = Object.values(doc.paths).flatMap((item) => Object.values(item));
    const api = importApiText(templateOpenApi(), 'openapi.json');
    expect(api.endpoints).toHaveLength(operations.length);
    const total = api.endpoints.reduce((sum, endpoint) => sum + scenarioNames(endpoint).length, 0);
    expect(total).toBe(operations.reduce((sum, operation) => sum + Object.keys(operation.responses).length, 0));
    expect(BackendSchema.safeParse({ name: 'tpl', endpoints: api.endpoints }).success).toBe(true);
  });
});

describe('AC-LP-5 a $ref bomb', () => {
  it('AC-LP-5 stops with a clear error instead of exhausting memory', () => {
    const started = Date.now();
    expect(() => importApiText(refBomb(), 'bomb.json')).toThrow(new RegExp(`more than ${String(MAX_RESOLVED_NODES)} schema nodes`));
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('AC-LP-5 generated data', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer', minimum: 10, maximum: 20 },
      email: { type: 'string', format: 'email' },
      uuid: { type: 'string', format: 'uuid' },
      at: { type: 'string', format: 'date-time' },
      site: { type: 'string', format: 'uri' },
      kind: { type: 'string', enum: ['a', 'b'] },
      tags: { type: 'array', items: { type: 'string', minLength: 3, maxLength: 5 } },
      price: { type: 'number', minimum: 0, maximum: 1 },
      done: { type: 'boolean' },
    },
  };

  it('AC-LP-5 gives the same output twice for the same seed, and another for another seed', () => {
    expect(generateFromSchema(schema, 'get.x|200')).toEqual(generateFromSchema(schema, 'get.x|200'));
    expect(generateFromSchema(schema, 'get.x|200')).not.toEqual(generateFromSchema(schema, 'get.x|404'));
  });

  it('AC-LP-5 honours formats, enums, limits and the 1 to 3 items of an array', () => {
    const value = generateFromSchema(schema, 'seed') as Record<string, unknown>;
    expect(value.id).toBeGreaterThanOrEqual(10);
    expect(value.id).toBeLessThanOrEqual(20);
    expect(value.email).toMatch(/^[^@\s]+@example\.com$/);
    expect(value.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Number.isNaN(Date.parse(String(value.at)))).toBe(false);
    expect(String(value.site)).toMatch(/^https:\/\//);
    expect(['a', 'b']).toContain(value.kind);
    const tags = value.tags as string[];
    expect(tags.length).toBeGreaterThanOrEqual(1);
    expect(tags.length).toBeLessThanOrEqual(3);
    for (const tag of tags) expect(tag.length >= 3 && tag.length <= 5).toBe(true);
    expect(value.price).toBeGreaterThanOrEqual(0);
    expect(value.price).toBeLessThanOrEqual(1);
    expect(typeof value.done).toBe('boolean');
  });

  it('AC-LP-5 imports the same file to the same endpoints every time', () => {
    const first = importApiText(fixture('oas31-features.json'), 'a.json');
    const second = importApiText(fixture('oas31-features.json'), 'a.json');
    expect(second.endpoints).toEqual(first.endpoints);
  });
});
