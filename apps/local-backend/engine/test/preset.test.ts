import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startBackend, type RunningBackend } from '../src/app.ts';
import { createBackend, PRESETS } from '../src/folder.ts';
import { presets, templateProduct } from '../src/presets.ts';

import { AppConfigSchema, BY_COMPONENT, CreatedItemSchema, ItemSchema, ItemsPageSchema, LoginResponseSchema, OtpResendResponseSchema, OtpVerifyResponseSchema, SuccessResponseSchema, TokensSchema, UserSchema } from './fixtures/template-schemas.ts';
import { json, tempDir } from './helpers.ts';

const TEMPLATE_OPENAPI = resolve(import.meta.dirname, 'fixtures/template-openapi.json');

const started: RunningBackend[] = [];
afterEach(async () => {
  await Promise.all(started.splice(0).map((backend) => backend.stop()));
});

async function open(dir: string): Promise<{ url: string; backend: RunningBackend }> {
  const backend = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, watch: false });
  started.push(backend);
  return { url: `http://127.0.0.1:${backend.port}`, backend };
}

const send = (url: string, method = 'GET', body?: unknown, token?: string): Promise<Response> =>
  fetch(url, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function parse<T extends z.ZodType>(response: Response, schema: T, status = 200): Promise<z.infer<T>> {
  expect(response.status).toBe(status);
  return schema.parse(await response.json());
}

describe('presets list', () => {
  it('is listed with a name and a description, and the CLI accepts every id', () => {
    expect(presets.map((preset) => preset.id)).toEqual([...PRESETS]);
    for (const preset of presets) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
    expect(presets.find((preset) => preset.id === 'tempo-template')?.name).toBe('Tempo template');
  });
});

describe('Tempo template preset', () => {
  const create = (): string => {
    const dir = join(tempDir(), 'backend');
    createBackend(dir, { name: 'Tempo template', preset: 'tempo-template' });
    return dir;
  };

  it('writes backend.json, seed/products.json and the stats handler', () => {
    const dir = create();
    expect(existsSync(join(dir, 'backend.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'seed/products.json'), 'utf8'))).toHaveLength(100);
    expect(readFileSync(join(dir, 'handlers/stats-summary.js'), 'utf8')).toContain('export default async function');
    const definition = JSON.parse(readFileSync(join(dir, 'backend.json'), 'utf8')) as { endpoints: { method: string; path: string; aliases?: string[] }[] };
    const routes = definition.endpoints.flatMap((endpoint) => [endpoint.path, ...(endpoint.aliases ?? [])].map((path) => `${endpoint.method} ${path}`));
    expect(routes).toEqual(
      expect.arrayContaining([
        'POST /auth/login', 'POST /auth/refresh', 'GET /auth/me', 'POST /users/add', 'PUT /users/:id', 'POST /auth/forgot-password', 'POST /auth/otp/verify',
        'POST /auth/otp/resend', 'GET /products', 'GET /products/search', 'GET /products/:id', 'POST /products/add', 'GET /app-config', 'POST /media/upload',
        'GET /media/:id', 'GET /stats/summary',
      ]),
    );
  });

  it('seeds the mock data exactly: emilys and the 100 products', async () => {
    const { url } = await open(create());
    const login = await parse(await send(`${url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass', expiresInMins: 60 }), LoginResponseSchema);
    expect(login).toMatchObject({ id: 1, username: 'emilys', email: 'emily.johnson@x.dummyjson.com', firstName: 'Emily', lastName: 'Johnson', gender: 'female', image: 'https://dummyjson.com/icon/emilys/128' });
    const all = await parse(await send(`${url}/products?limit=0`), ItemsPageSchema);
    expect(all.total).toBe(100);
    expect(all.products).toHaveLength(100);
    expect(all.products[0]).toEqual({ id: 1, title: 'Product 1', description: 'Description of product 1', price: 6, category: 'beauty', thumbnail: 'https://dummyjson.com/image/200x200?text=Product%201', rating: 3.1, stock: 11 });
    expect(all.products[99]).toEqual({ id: 100, title: 'Product 100', description: 'Description of product 100', price: 105, category: 'groceries', thumbnail: 'https://dummyjson.com/image/200x200?text=Product%20100', rating: 3, stock: 10 });
    all.products.forEach((product, index) => expect(product).toEqual(templateProduct(index + 1)));
    expect(new Set(all.products.map((product) => product.category))).toEqual(new Set(['beauty', 'fragrances', 'furniture', 'groceries']));
  });

  it('seeds a published announcement in English and Arabic for the What\'s new screen (AC-LB-7)', async () => {
    const dir = create();
    const { url, backend } = await open(dir);
    const ar = (await (await send(`${url}/content/announcement?locale=ar`)).json()) as { items: { slug: string; locale: string; availableLocales: string[]; fallbackFields: string[]; fields: Record<string, unknown> }[]; total: number };
    expect(ar.total).toBe(1);
    expect(ar.items[0]).toMatchObject({ slug: 'welcome', locale: 'ar', availableLocales: ['en', 'ar'], fallbackFields: [] });
    expect(ar.items[0]?.fields.title).toBe('مرحبًا بك في Tempo');
    expect(Object.keys(ar.items[0]?.fields ?? {})).toEqual(['title', 'body', 'image', 'ctaLabel', 'ctaUrl']);
    const en = (await (await send(`${url}/content/announcement?locale=en`)).json()) as { items: { fields: Record<string, unknown> }[] };
    expect(en.items[0]?.fields).toMatchObject({ title: 'Welcome to Tempo', ctaLabel: 'Learn more', image: null });
    expect(String(en.items[0]?.fields.body)).toContain('**local announcement**');
    // Content is not an endpoint of the template contract: it is only extra in the contract check.
    expect(backend.engine.definition.contentTypes.map((type) => [type.name, type.localized])).toEqual([['announcement', true]]);
  });

  it('answers every endpoint in the shape the template parses', async () => {
    const dir = create();
    const { url } = await open(dir);
    const login = await parse(await send(`${url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass' }), LoginResponseSchema);
    const token = login.accessToken;
    expect(await send(`${url}/auth/login`, 'POST', { username: 'emilys', password: 'nope' }).then((r) => r.status)).toBe(400);
    await parse(await send(`${url}/auth/refresh`, 'POST', { refreshToken: login.refreshToken }), TokensSchema);
    expect((await send(`${url}/auth/me`, 'GET')).status).toBe(401);
    expect(await parse(await send(`${url}/auth/me`, 'GET', undefined, token), UserSchema)).toMatchObject({ username: 'emilys' });
    await parse(await send(`${url}/auth/forgot-password`, 'POST', { email: 'emily.johnson@x.dummyjson.com' }), SuccessResponseSchema);
    expect(await parse(await send(`${url}/auth/otp/verify`, 'POST', { target: 'a@b.test', code: '123456', purpose: 'register' }), OtpVerifyResponseSchema)).toEqual({ success: true });
    expect(await parse(await send(`${url}/auth/otp/verify`, 'POST', { target: 'a@b.test', code: '000000', purpose: 'register' }), OtpVerifyResponseSchema)).toEqual({ success: false });
    expect(await parse(await send(`${url}/auth/otp/resend`, 'POST', { target: 'a@b.test', purpose: 'register' }), OtpResendResponseSchema)).toEqual({ success: true, retryAfterSec: 60 });
    const added = await parse(await send(`${url}/users/add`, 'POST', { firstName: 'Zed', lastName: 'Z', username: 'zed', email: 'zed@example.test', password: 'zedspass1' }), UserSchema, 201);
    expect(added).toMatchObject({ id: 209, username: 'zed', firstName: 'Zed' }); // echoed, like the mock: nothing is stored
    expect((await send(`${url}/users/${login.id}`, 'PUT', { firstName: 'X' })).status).toBe(401);
    expect((await send(`${url}/users/${login.id + 1}`, 'PUT', { firstName: 'X' }, token)).status).toBe(403);
    await parse(await send(`${url}/users/${login.id}`, 'PUT', { firstName: 'Emilia', lastName: 'Johnson', email: 'emilia@example.test' }, token), UserSchema);
    const page = await parse(await send(`${url}/products?limit=2&skip=0`), ItemsPageSchema);
    expect(page).toMatchObject({ total: 100, skip: 0 });
    expect(page.products.map((p) => p.id)).toEqual([1, 2]);
    expect((await parse(await send(`${url}/products`), ItemsPageSchema)).products).toHaveLength(30); // the template's default limit
    const search = await parse(await send(`${url}/products/search?q=product%2042`), ItemsPageSchema);
    expect(search.products.map((p) => p.title)).toEqual(['Product 42']);
    expect(search.total).toBe(1);
    expect((await parse(await send(`${url}/products/search?q=product%201&limit=5&skip=1`), ItemsPageSchema)).skip).toBe(1);
    expect(await parse(await send(`${url}/products/7`), ItemSchema)).toEqual(templateProduct(7));
    expect((await send(`${url}/products/9999`)).status).toBe(404);
    const config = await parse(await send(`${url}/app-config`), AppConfigSchema);
    expect(config.maintenance.enabled).toBe(false);
    expect(config.flags).toEqual({});
    const stats = await json(await send(`${url}/stats/summary`));
    expect(stats).toEqual({ products: 100, users: 1 });
  });

  it('adds a product that lists, strips extra fields, and survives an engine restart (AC-LB-1, engine side)', async () => {
    const dir = create();
    let { url, backend } = await open(dir);
    const created = await parse(
      await send(`${url}/products/add`, 'POST', { title: 'Lamp', description: 'A lamp', category: 'furniture', price: 12.5, quantity: 3, tags: ['a'], attachment: null, pickupLocation: { latitude: 1, longitude: 2 } }),
      CreatedItemSchema,
      201,
    );
    expect(created).toMatchObject({ id: 101, title: 'Lamp', price: 12.5, rating: 0, stock: 0 });
    expect(created).not.toHaveProperty('quantity');
    expect(created.thumbnail).toBe(String(templateProduct(101).thumbnail));
    expect((await parse(await send(`${url}/products?limit=0`), ItemsPageSchema)).total).toBe(101);
    expect((await parse(await send(`${url}/products/search?q=lamp`), ItemsPageSchema)).products[0]?.id).toBe(101);
    const empty = await parse(await send(`${url}/products/add`, 'POST', {}), CreatedItemSchema, 201); // the mock accepts an empty body too
    expect(empty.id).toBe(102);
    const login = await parse(await send(`${url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass' }), LoginResponseSchema);
    await parse(await send(`${url}/users/${login.id}`, 'PUT', { firstName: 'Emilia', lastName: 'Jones', email: 'emilia@example.test' }, login.accessToken), UserSchema);
    await backend.stop();
    started.splice(0);
    ({ url, backend } = await open(dir));
    expect((await parse(await send(`${url}/products?limit=0`), ItemsPageSchema)).total).toBe(102);
    expect((await parse(await send(`${url}/products/101`), ItemSchema)).title).toBe('Lamp');
    // The database, not the seed, is the truth after a restart: nothing is seeded twice.
    const again = await parse(await send(`${url}/auth/login`, 'POST', { username: 'emilys', password: 'emilyspass' }), LoginResponseSchema);
    expect(await parse(await send(`${url}/auth/me`, 'GET', undefined, again.accessToken), UserSchema)).toMatchObject({ firstName: 'Emilia', lastName: 'Jones', email: 'emilia@example.test' });
  });

  it('uploads and downloads a file through the preset', async () => {
    const { url } = await open(create());
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'a.pdf');
    const response = await fetch(`${url}/media/upload`, { method: 'POST', body: form });
    expect(response.status).toBe(201);
    const file = z.object({ id: z.string(), url: z.string() }).parse(await response.json());
    expect(file.url).toContain(`/media/${file.id}`);
    const back = await fetch(`${url}/media/${file.id}`);
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
  });
});

describe('the fixture schemas match the template openapi.json (drift check)', () => {
  const document = JSON.parse(readFileSync(TEMPLATE_OPENAPI, 'utf8')) as { components: { schemas: Record<string, unknown> } };

  for (const [name, schema] of Object.entries(BY_COMPONENT)) {
    it(`${name}`, () => {
      const generated = z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as Record<string, unknown>;
      delete generated.$schema;
      // Zod 4 adds the safe-integer bound to `.int()`; the template's generator leaves it out.
      expect(JSON.parse(JSON.stringify(generated, (key, value: unknown) => (key === 'maximum' && value === Number.MAX_SAFE_INTEGER ? undefined : value)))).toEqual(document.components.schemas[name]);
    });
  }

  it('covers every response component of the document', () => {
    const responses = Object.keys(document.components.schemas).filter((name) => name.endsWith('Response'));
    expect(responses.sort()).toEqual(Object.keys(BY_COMPONENT).sort());
  });
});
