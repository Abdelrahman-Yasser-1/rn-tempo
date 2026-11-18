import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminRouteList } from '../src/admin.ts';
import { startBackend } from '../src/app.ts';
import { SCHEDULE_TICK_MS } from '../src/engine.ts';
import { buildOpenApi } from '../src/openapi.ts';
import { DefinitionError, parseBackend, type BackendInput } from '../src/schema.ts';
import { exportSnapshot, importSnapshot } from '../src/snapshot.ts';

import { json, serve, stopAll, tempDir } from './helpers.ts';

afterEach(async () => {
  vi.useRealTimers();
  await stopAll();
});

const article = {
  name: 'article',
  label: 'Article',
  localized: true,
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'summary', type: 'text' },
    { name: 'body', type: 'richText' },
    { name: 'views', type: 'number' },
    { name: 'featured', type: 'boolean' },
    { name: 'publishedOn', type: 'date' },
    { name: 'kind', type: 'enum', enumValues: ['news', 'tip'] },
    { name: 'cover', type: 'media' },
    { name: 'meta', type: 'json' },
    { name: 'tags', type: 'list' },
  ],
} as const;

type ContentTypeInput = NonNullable<BackendInput['contentTypes']>[number];
const articleType = (): ContentTypeInput => structuredClone(article) as unknown as ContentTypeInput;

const definition = (extra: Partial<BackendInput> = {}): BackendInput => ({ name: 'cms', contentTypes: [articleType()], ...extra });

/** A clock the tests move by hand. */
function clock(start = '2026-11-18T10:00:00.000Z'): { now: () => Date; set(iso: string): void } {
  let current = new Date(start);
  return { now: () => new Date(current), set: (iso) => void (current = new Date(iso)) };
}

async function setup(def: BackendInput = definition(), time = clock()) {
  const { backend, url, dir } = await serve(def, { now: time.now });
  const admin = `http://127.0.0.1:${backend.admin.port}/__admin`;
  const call = (path: string, method = 'GET', body?: unknown, token: string | undefined = backend.admin.token): Promise<Response> =>
    fetch(`${admin}${path}`, {
      method,
      headers: { ...(token === undefined ? {} : { authorization: `Bearer ${token}` }), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (body: unknown): Promise<Record<string, unknown>> => {
    const response = await call('/content/entries', 'POST', body);
    expect(response.status).toBe(201);
    return json(response);
  };
  const entry = async (id: unknown): Promise<Record<string, unknown>> => json(await call(`/content/entries/${String(id)}`));
  const act = (id: unknown, action: string, body?: unknown): Promise<Response> => call(`/content/entries/${String(id)}/${action}`, 'POST', body ?? {});
  const pub = (path: string): Promise<Response> => fetch(`${url}${path}`);
  return { backend, url, dir, call, create, entry, act, pub, time };
}

const en = { title: 'Hello', summary: 'Short', body: 'Some **bold** text', views: 3, featured: true, publishedOn: '2026-11-17', kind: 'news', meta: { a: 1 }, tags: ['x', 'y'] };

describe('content types in backend.json', () => {
  it('accepts every field type and fills the defaults (the template languages)', () => {
    const def = parseBackend(definition());
    expect(def.content).toEqual({ mount: '/content', locales: ['en', 'ar'], defaultLocale: 'en' });
    expect(def.contentTypes[0]?.fields.map((field) => field.type)).toEqual(['string', 'text', 'richText', 'number', 'boolean', 'date', 'enum', 'media', 'json', 'list']);
    const loose = parseBackend({ name: 'x', contentTypes: [{ name: 'page' }] });
    expect(loose.contentTypes[0]).toMatchObject({ name: 'page', fields: [], localized: false });
  });

  const issues = (input: unknown): string[] => {
    try {
      parseBackend(input);
    } catch (error) {
      if (error instanceof DefinitionError) return error.issues.map((issue) => `${issue.path}: ${issue.message}`);
      throw error;
    }
    return [];
  };

  it('checks locales, names, enums, defaults and seeds, naming the path', () => {
    expect(issues({ name: 'x', content: { locales: ['en'], defaultLocale: 'ar' } }).join()).toContain('content.defaultLocale');
    expect(issues({ name: 'x', content: { locales: ['en', 'en'] } }).join()).toContain('Duplicate locale');
    expect(issues({ name: 'x', content: { locales: ['EN!'] } }).join()).toContain('content.locales[0]');
    expect(issues({ name: 'x', content: { mount: '/__x' } }).join()).toContain('reserved');
    expect(issues({ name: 'x', contentTypes: [{ name: 'a' }, { name: 'A' }] }).join()).toContain('Duplicate content type');
    expect(issues({ name: 'x', contentTypes: [{ name: 'a', fields: [{ name: 'k', type: 'enum' }] }] }).join()).toContain('enumValues');
    expect(issues({ name: 'x', contentTypes: [{ name: 'a', fields: [{ name: 'k', type: 'number', default: 'no' }] }] }).join()).toContain('default is wrong');
    expect(issues({ name: 'x', contentTypes: [{ name: 'a', fields: [{ name: 'k', type: 'string' }, { name: 'K', type: 'string' }] }] }).join()).toContain('Duplicate field');
    expect(issues({ name: 'x', contentTypes: [{ name: 'a', singleton: true, seed: [{ values: {} }, { values: {} }] }] }).join()).toContain('singleton');
    const seeded = (seed: unknown): string => issues({ name: 'x', contentTypes: [{ ...article, seed: [seed] }] }).join();
    expect(seeded({ values: { de: { title: 'x' } } })).toContain('Unknown locale "de"');
    expect(seeded({ values: { en: { nope: 'x' } } })).toContain('Unknown field "nope"');
    expect(seeded({ values: { en: { title: 5 } } })).toContain('Must be text');
    expect(seeded({ values: { en: { summary: 'no title' } } })).toContain('Required to publish');
    expect(seeded({ slug: '123', values: { en: { title: 'x' } } })).toContain('slug');
  });

  it('refuses an endpoint inside the content mount, only once there are content types', () => {
    const endpoint = { id: 's', type: 'static', method: 'GET', path: '/content/news' };
    expect(issues({ name: 'x', contentTypes: [{ name: 'a' }], endpoints: [endpoint] }).join()).toContain('inside the content mount "/content"');
    expect(issues({ name: 'x', contentTypes: [{ name: 'a' }], endpoints: [{ ...endpoint, path: '/ok', aliases: ['/content'] }] }).join()).toContain('inside the content mount');
    expect(issues({ name: 'x', endpoints: [endpoint] })).toEqual([]);
    expect(issues({ name: 'x', contentTypes: [{ name: 'a' }], endpoints: [{ ...endpoint, path: '/contents' }, { ...endpoint, id: 't', path: '/other/content' }] })).toEqual([]);
    expect(issues({ name: 'x', content: { mount: '/cms' }, contentTypes: [{ name: 'a' }], endpoints: [endpoint] })).toEqual([]);
  });
});

describe('admin: validation per field type', () => {
  it('stores each field type and refuses the wrong shapes, naming the path', async () => {
    const { call, create } = await setup();
    const made = await create({ type: 'article', slug: 'first', values: { en } });
    expect(made).toMatchObject({ status: 'draft', slug: 'first', version: 1, values: { en } });
    const bad = async (values: unknown, path: string): Promise<void> => {
      const response = await call('/content/entries', 'POST', { type: 'article', values });
      expect(response.status, path).toBe(400);
      const body = (await json(response)) as { errors: { path: string }[] };
      expect(body.errors[0]?.path).toBe(path);
    };
    await bad({ en: { title: 5 } }, 'values.en.title');
    await bad({ en: { views: '3' } }, 'values.en.views');
    await bad({ en: { featured: 'yes' } }, 'values.en.featured');
    await bad({ en: { publishedOn: 'tomorrow' } }, 'values.en.publishedOn');
    await bad({ en: { kind: 'other' } }, 'values.en.kind');
    await bad({ en: { tags: ['a', 1] } }, 'values.en.tags');
    await bad({ en: { tags: 'a' } }, 'values.en.tags');
    await bad({ en: { cover: 7 } }, 'values.en.cover');
    await bad({ en: { cover: '0123456789abcdef0123456789abcdef' } }, 'values.en.cover'); // no such media
    await bad({ en: { nope: 1 } }, 'values.en.nope');
    await bad({ fr: { title: 'x' } }, 'values.fr');
    await bad({ en: 'text' }, 'values.en');
    await bad([], 'values');
    expect((await call('/content/entries', 'POST', { type: 'nope' })).status).toBe(404);
    expect((await call('/content/entries', 'POST', {})).status).toBe(400);
    expect((await call('/content/entries', 'POST', { type: 'article', slug: 'has space' })).status).toBe(400);
    expect((await call('/content/entries', 'POST', { type: 'article', slug: '42' })).status).toBe(400);
    expect((await call('/content/entries', 'POST', { type: 'article', slug: 'first' })).status).toBe(409);
  });

  it('keeps a media id that exists and treats null as clearing a field', async () => {
    const { call, create, backend } = await setup();
    const upload = await fetch(`http://127.0.0.1:${backend.admin.port}/__admin/media?name=a.png`, {
      method: 'POST',
      headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'image/png' },
      body: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
    });
    const media = (await json(upload)) as { id: string };
    const made = await create({ type: 'article', values: { en: { title: 'With cover', cover: media.id } } });
    expect((made.values as { en: { cover: string } }).en.cover).toBe(media.id);
    const saved = await json(await call(`/content/entries/${String(made.id)}`, 'PUT', { values: { en: { title: 'With cover', cover: null } } }));
    expect(saved.values).toEqual({ en: { title: 'With cover' } });
  });

  it('is not localized: only the default locale is accepted', async () => {
    const { call, create } = await setup(definition({ contentTypes: [{ name: 'page', fields: [{ name: 'title', type: 'string' }] }] }));
    const made = await create({ type: 'page', values: { en: { title: 'One' } } });
    expect(made.values).toEqual({ en: { title: 'One' } });
    const response = await call('/content/entries', 'POST', { type: 'page', values: { ar: { title: 'x' } } });
    expect(response.status).toBe(400);
    expect(((await json(response)) as { detail: string }).detail).toContain('not localized');
  });

  it('publishing needs the required fields in the default locale; a draft does not', async () => {
    const { act, create } = await setup();
    const draft = await create({ type: 'article', values: { ar: { title: 'عنوان' } } });
    expect(draft.status).toBe('draft');
    const refused = await act(draft.id, 'publish');
    expect(refused.status).toBe(400);
    expect(((await json(refused)) as { errors: { path: string }[] }).errors[0]?.path).toBe('values.en.title');
    expect((await act(draft.id, 'schedule', { publishAt: '2026-12-01T00:00:00Z' })).status).toBe(400);
  });

  it('a singleton type holds one entry', async () => {
    const { call, create, act, pub } = await setup(definition({ contentTypes: [{ name: 'home', singleton: true, localized: true, fields: [{ name: 'headline', type: 'string' }] }] }));
    const first = await create({ type: 'home', values: { en: { headline: 'Hi' } } });
    expect((await call('/content/entries', 'POST', { type: 'home' })).status).toBe(409);
    expect((await pub('/content/home')).status).toBe(404); // not published yet
    await act(first.id, 'publish');
    const answer = await json(await pub('/content/home?locale=en'));
    expect(answer).toMatchObject({ type: 'home', fields: { headline: 'Hi' } });
    expect(answer).not.toHaveProperty('items');
  });
});

describe('admin: content types and field migrations', () => {
  it('adds a type, then a field with a default that fills the existing values', async () => {
    const { call, create, entry } = await setup(definition());
    expect((await call('/content/types', 'POST', { name: 'faq', label: 'FAQ', fields: [{ name: 'q', type: 'string' }] })).status).toBe(200);
    const faq = await create({ type: 'faq', values: { en: { q: 'Why?' } } });
    expect((await call('/content/types/faq/fields', 'POST', { name: 'level', type: 'number', default: 1 })).status).toBe(200);
    expect(((await entry(faq.id)) as { values: unknown }).values).toEqual({ en: { q: 'Why?', level: 1 } });
    const types = (await (await call('/content/types')).json()) as { name: string; entries: number }[];
    expect(types.map((type) => [type.name, type.entries])).toEqual([['article', 0], ['faq', 1]]);
    expect((await call('/content/types/faq')).status).toBe(200);
    expect((await call('/content/types/missing')).status).toBe(404);
    expect((await call('/content/types', 'POST', { name: 'faq' })).status).toBe(400); // duplicate
  });

  it('removing a field with values asks for confirm (409), keeps everything when refused, and drops the values when confirmed', async () => {
    const { call, create, entry, backend } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T', summary: 'S' }, ar: { title: 'ع', summary: 'م' } } });
    const refused = await call('/content/types/article/fields/summary', 'DELETE');
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({ confirmRequired: true, lost: [{ kind: 'contentField', collection: 'article', field: 'summary', rows: 2 }] });
    expect(((await entry(made.id)) as { values: { en: unknown } }).values.en).toEqual({ title: 'T', summary: 'S' });
    expect(JSON.parse(readFileSync(backend.engine.folder.definitionPath, 'utf8')).contentTypes[0].fields.some((f: { name: string }) => f.name === 'summary')).toBe(true);
    expect((await call('/content/types/article/fields/summary?confirm=true', 'DELETE')).status).toBe(200);
    expect(((await entry(made.id)) as { values: unknown }).values).toEqual({ en: { title: 'T' }, ar: { title: 'ع' } });
  });

  it('dropping a field needs confirm even with no values, and so does a type change that drops them', async () => {
    const { call, create } = await setup();
    const none = await call('/content/types/article/fields/tags', 'DELETE'); // no entry has tags, but dropping a field is confirmed like a collection's
    expect(none.status).toBe(409);
    expect(await json(none)).toMatchObject({ lost: [{ kind: 'contentField', field: 'tags', rows: 0 }] });
    expect((await call('/content/types/article/fields/tags?confirm=true', 'DELETE')).status).toBe(200);
    await create({ type: 'article', values: { en: { title: 'T', views: 3 } } });
    const type = (await (await call('/content/types/article')).json()) as { fields: { name: string; type: string }[] };
    const retyped = { ...type, fields: type.fields.map((field) => (field.name === 'views' ? { ...field, type: 'string' } : field)) };
    expect((await call('/content/types/article', 'PUT', retyped)).status).toBe(409);
    expect((await call('/content/types/article?confirm=true', 'PUT', retyped)).status).toBe(200);
  });

  it('renames a field and moves its values, with no confirm', async () => {
    const { call, create, entry } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T', summary: 'S' }, ar: { summary: 'م' } } });
    expect((await call('/content/types/article/fields/summary/rename', 'POST', { to: 'intro' })).status).toBe(200);
    expect(((await entry(made.id)) as { values: unknown }).values).toEqual({ en: { title: 'T', intro: 'S' }, ar: { intro: 'م' } });
  });

  it('a type that stops being localized keeps only the default locale (confirm); removing the type needs confirm too', async () => {
    const { call, create, entry } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' }, ar: { title: 'ع' } } });
    const type = (await (await call('/content/types/article')).json()) as Record<string, unknown>;
    const flat = { ...type, localized: false };
    const refused = await call('/content/types/article', 'PUT', flat);
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({ lost: [{ kind: 'contentLocale', collection: 'article', rows: 1 }] });
    expect((await call('/content/types/article?confirm=true', 'PUT', flat)).status).toBe(200);
    expect(((await entry(made.id)) as { values: unknown }).values).toEqual({ en: { title: 'T' } });
    const gone = await call('/content/types/article', 'DELETE');
    expect(gone.status).toBe(409);
    expect(await json(gone)).toMatchObject({ lost: [{ kind: 'contentType', collection: 'article', rows: 1 }] });
    expect((await call('/content/types/article?confirm=true', 'DELETE')).status).toBe(200);
    expect((await call(`/content/entries/${String(made.id)}`)).status).toBe(404);
  });

  it('removing a locale through the definition deletes its values only after confirm', async () => {
    const { call, create, entry, backend } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' }, ar: { title: 'ع' } } });
    const next = { ...backend.manager.definition(), content: { locales: ['en'], defaultLocale: 'en' } };
    const refused = await call('/definition', 'PUT', next);
    expect(refused.status).toBe(409);
    expect(await json(refused)).toMatchObject({ lost: [{ kind: 'contentLocale', collection: '', locale: 'ar', rows: 1 }] });
    expect((await call('/definition?confirm=true', 'PUT', next)).status).toBe(200);
    expect(((await entry(made.id)) as { values: unknown }).values).toEqual({ en: { title: 'T' } });
  });

  it('a type cannot become a singleton while it holds several entries', async () => {
    const { call, create } = await setup();
    await create({ type: 'article', values: { en: { title: 'a' } } });
    await create({ type: 'article', values: { en: { title: 'b' } } });
    const type = (await (await call('/content/types/article')).json()) as Record<string, unknown>;
    const refused = await call('/content/types/article', 'PUT', { ...type, singleton: true });
    expect(refused.status).toBe(409);
    expect(((await json(refused)) as { detail: string }).detail).toContain('singleton');
  });

  it('refuses a type whose definition is invalid, and an endpoint under the mount', async () => {
    const { call } = await setup();
    const bad = await call('/content/types', 'POST', { name: 'Bad Name' });
    expect(bad.status).toBe(400);
    const clash = await call('/endpoints', 'POST', { id: 'x', type: 'static', method: 'GET', path: '/content/x' });
    expect(clash.status).toBe(400);
    expect(JSON.stringify(await json(clash))).toContain('inside the content mount');
  });
});

describe('publish, unpublish, schedule and revert (injected clock)', () => {
  it('publish sets the time, unpublish hides and clears it', async () => {
    const { create, act, entry, time } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' } } });
    time.set('2026-11-18T11:00:00.000Z');
    const published = await json(await act(made.id, 'publish'));
    expect(published).toMatchObject({ status: 'published', publishAt: '2026-11-18T11:00:00.000Z', updatedAt: '2026-11-18T11:00:00.000Z' });
    const hidden = await json(await act(made.id, 'unpublish'));
    expect(hidden).toMatchObject({ status: 'draft', publishAt: null });
    expect((await entry(made.id)).status).toBe('draft');
  });

  it('schedule needs a future time, then the entry goes live when the clock reaches it', async () => {
    const { create, act, entry, time, pub } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' } } });
    expect((await act(made.id, 'schedule', { publishAt: 'soon' })).status).toBe(400);
    expect((await act(made.id, 'schedule', {})).status).toBe(400);
    expect((await act(made.id, 'schedule', { publishAt: '2026-11-18T09:00:00Z' })).status).toBe(400); // in the past
    const scheduled = await json(await act(made.id, 'schedule', { publishAt: '2026-11-18T10:00:02Z' }));
    expect(scheduled).toMatchObject({ status: 'scheduled', publishAt: '2026-11-18T10:00:02.000Z' });
    expect(((await (await pub('/content/article')).json()) as { total: number }).total).toBe(0);
    time.set('2026-11-18T10:00:01.999Z');
    expect(((await (await pub('/content/article')).json()) as { total: number }).total).toBe(0);
    time.set('2026-11-18T10:00:02.000Z');
    expect(((await (await pub('/content/article')).json()) as { total: number }).total).toBe(1); // the read itself publishes it
    expect((await entry(made.id)).status).toBe('published');
  });

  it('a 30 second timer publishes due entries even when nobody reads', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { create, act, time, backend } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' } } });
    await act(made.id, 'schedule', { publishAt: '2026-11-18T10:00:10Z' });
    const status = (): unknown => backend.engine.store.db.prepare('SELECT status FROM _content_entries WHERE id = ?').get(made.id as number)?.status;
    expect(status()).toBe('scheduled');
    time.set('2026-11-18T10:00:11Z');
    vi.advanceTimersByTime(SCHEDULE_TICK_MS);
    expect(status()).toBe('published');
  });

  it('keeps the last 10 versions, and reverting restores a version as a new one without changing the status', async () => {
    const { create, call, act, entry } = await setup();
    const made = await create({ type: 'article', slug: 'v', values: { en: { title: 'v1' } } });
    await act(made.id, 'publish');
    for (let n = 2; n <= 13; n += 1) await call(`/content/entries/${String(made.id)}`, 'PUT', { values: { en: { title: `v${String(n)}` } } });
    const list = ((await (await call(`/content/entries/${String(made.id)}/versions`)).json()) as { items: { version: number; reason: string }[] }).items;
    expect(list).toHaveLength(10);
    expect(list.map((item) => item.version)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
    expect(list[0]?.reason).toBe('save');
    expect(((await (await call(`/content/entries/${String(made.id)}/versions/5`)).json()) as { values: unknown }).values).toEqual({ en: { title: 'v5' } });
    expect((await call(`/content/entries/${String(made.id)}/versions/2`)).status).toBe(404); // pruned
    expect((await act(made.id, 'revert', { version: 2 })).status).toBe(404);
    expect((await act(made.id, 'revert', {})).status).toBe(400);
    const reverted = await json(await act(made.id, 'revert', { version: 5 }));
    expect(reverted).toMatchObject({ status: 'published', version: 14, values: { en: { title: 'v5' } } });
    expect(((await (await call(`/content/entries/${String(made.id)}/versions`)).json()) as { items: { reason: string }[] }).items[0]?.reason).toBe('revert');
    expect(((await entry(made.id)) as { values: unknown }).values).toEqual({ en: { title: 'v5' } });
  });

  it('revert brings the slug back too; a slug taken meanwhile is a 409', async () => {
    const { create, call, act } = await setup();
    const a = await create({ type: 'article', slug: 'old', values: { en: { title: 'a' } } });
    await call(`/content/entries/${String(a.id)}`, 'PUT', { slug: 'new' });
    await create({ type: 'article', slug: 'old', values: { en: { title: 'b' } } });
    expect((await act(a.id, 'revert', { version: 1 })).status).toBe(409);
  });

  it('delete removes the entry, its values and its versions', async () => {
    const { create, call, backend } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' } } });
    expect((await call(`/content/entries/${String(made.id)}`, 'DELETE')).status).toBe(200);
    expect((await call(`/content/entries/${String(made.id)}`, 'DELETE')).status).toBe(404);
    const { db } = backend.engine.store;
    for (const table of ['_content_entries', '_content_values', '_content_versions']) expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n).toBe(0);
  });

  it('lists entries with a title, the locales that have values, a status filter and a search', async () => {
    const { create, act, call } = await setup();
    const a = await create({ type: 'article', values: { en: { title: 'Alpha' }, ar: { title: 'ألف' } } });
    await create({ type: 'article', values: { en: { title: 'Beta' } } });
    await act(a.id, 'publish');
    const all = (await (await call('/content/entries?type=article')).json()) as { items: { title: string; locales: string[]; status: string }[]; total: number };
    expect(all.total).toBe(2);
    expect(all.items.map((item) => [item.title, item.locales, item.status]).sort()).toEqual([['Alpha', ['en', 'ar'], 'published'], ['Beta', ['en'], 'draft']]);
    expect(((await (await call('/content/entries?status=published')).json()) as { total: number }).total).toBe(1);
    expect(((await (await call('/content/entries?q=bet')).json()) as { items: { title: string }[] }).items.map((item) => item.title)).toEqual(['Beta']);
    expect((await call('/content/entries?status=bogus')).status).toBe(400);
    expect((await call('/content/entries/abc')).status).toBe(404);
  });
});

describe('public content API (AC-LB-7)', () => {
  it('publishing an entry makes it appear from GET /content/:type?locale=ar; unpublishing hides it', async () => {
    const { create, act, pub } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'Hello' }, ar: { title: 'مرحبا' } } });
    const empty = (await (await pub('/content/article?locale=ar')).json()) as { items: unknown[]; total: number };
    expect(empty).toMatchObject({ items: [], total: 0 });
    expect((await pub(`/content/article/${String(made.id)}?locale=ar`)).status).toBe(404); // a draft is not public
    await act(made.id, 'publish');
    const live = (await (await pub('/content/article?locale=ar')).json()) as { items: { id: number; locale: string; fields: { title: string } }[]; total: number };
    expect(live.total).toBe(1);
    expect(live.items[0]).toMatchObject({ id: made.id, type: 'article', locale: 'ar', fields: { title: 'مرحبا' } });
    await act(made.id, 'unpublish');
    expect(((await (await pub('/content/article?locale=ar')).json()) as { total: number }).total).toBe(0);
    expect((await pub(`/content/article/${String(made.id)}`)).status).toBe(404);
  });

  it('shows the fields of every type, by id or slug, with the entry shape', async () => {
    const { create, act, pub, time } = await setup();
    time.set('2026-11-18T12:00:00.000Z');
    const made = await create({ type: 'article', slug: 'hello', values: { en } });
    await act(made.id, 'publish');
    const byId = (await (await pub(`/content/article/${String(made.id)}`)).json()) as Record<string, unknown>;
    const bySlug = await (await pub('/content/article/hello')).json();
    expect(bySlug).toEqual(byId);
    expect(byId).toEqual({
      id: made.id,
      type: 'article',
      slug: 'hello',
      locale: 'en',
      availableLocales: ['en'],
      fallbackFields: [],
      publishedAt: '2026-11-18T12:00:00.000Z',
      updatedAt: '2026-11-18T12:00:00.000Z',
      fields: { ...en, cover: null },
    });
    expect((await pub('/content/article/missing')).status).toBe(404);
    expect((await pub('/content/nope')).status).toBe(404);
    expect((await pub('/content/article/hello/extra')).status).toBe(404);
  });

  it('falls back to the default locale per field, and lists those fields', async () => {
    const { create, act, pub } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'Hello', summary: 'English summary' }, ar: { title: 'مرحبا', summary: '' } } });
    await act(made.id, 'publish');
    const ar = (await (await pub('/content/article/' + String(made.id) + '?locale=ar')).json()) as { locale: string; availableLocales: string[]; fallbackFields: string[]; fields: Record<string, unknown> };
    expect(ar).toMatchObject({ locale: 'ar', availableLocales: ['en', 'ar'], fallbackFields: ['summary'], fields: { title: 'مرحبا', summary: 'English summary' } });
    const noArabic = await create({ type: 'article', values: { en: { title: 'Only English' } } });
    await act(noArabic.id, 'publish');
    const second = (await (await pub('/content/article/' + String(noArabic.id) + '?locale=ar')).json()) as { fallbackFields: string[]; fields: { title: string } };
    expect(second.fields.title).toBe('Only English');
    expect(second.fallbackFields).toEqual(['title']);
    expect((await pub('/content/article?locale=xx')).status).toBe(400);
  });

  it('turns a media id into { id, url, name, mime, size }', async () => {
    const { create, act, pub, backend } = await setup();
    const upload = await fetch(`http://127.0.0.1:${backend.admin.port}/__admin/media?name=pic.png`, {
      method: 'POST',
      headers: { authorization: `Bearer ${backend.admin.token}`, 'content-type': 'image/png' },
      body: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
    });
    const media = (await json(upload)) as { id: string };
    const made = await create({ type: 'article', values: { en: { title: 'T', cover: media.id } } });
    await act(made.id, 'publish');
    const got = (await (await pub(`/content/article/${String(made.id)}`)).json()) as { fields: { cover: Record<string, unknown> } };
    expect(got.fields.cover).toMatchObject({ id: media.id, name: 'pic.png', mime: 'image/png', size: 16 });
    expect(got.fields.cover.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/media/${media.id}$`));
  });

  it('pages and sorts by updatedAt or publishedAt, with limit, skip and a cursor', async () => {
    const { create, act, call, pub, time } = await setup();
    const ids: number[] = [];
    for (const [n, at] of [['A', '10:00'], ['B', '11:00'], ['C', '12:00']] as const) {
      const made = await create({ type: 'article', values: { en: { title: n } } });
      time.set(`2026-11-18T${at}:00Z`);
      await act(made.id, 'publish');
      ids.push(made.id as number);
    }
    time.set('2026-11-18T13:00:00Z');
    await call(`/content/entries/${String(ids[0])}`, 'PUT', { values: { en: { title: 'A!' } } }); // A is the most recently edited
    const titles = async (query: string): Promise<string[]> => ((await (await pub(`/content/article?${query}`)).json()) as { items: { fields: { title: string } }[] }).items.map((item) => item.fields.title);
    expect(await titles('')).toEqual(['C', 'B', 'A!']); // newest published first
    expect(await titles('sort=publishedAt')).toEqual(['A!', 'B', 'C']);
    expect(await titles('sort=-updatedAt')).toEqual(['A!', 'C', 'B']);
    expect(await titles('sort=updatedAt')).toEqual(['B', 'C', 'A!']);
    expect(await titles('sort=publishAt')).toEqual(['A!', 'B', 'C']); // the admin's name works too
    const first = (await (await pub('/content/article?limit=2')).json()) as { items: unknown[]; total: number; limit: number; skip: number; nextCursor: string | null };
    expect(first).toMatchObject({ total: 3, limit: 2, skip: 0, nextCursor: '2' });
    expect(first.items).toHaveLength(2);
    const second = (await (await pub('/content/article?limit=2&cursor=2')).json()) as { items: unknown[]; skip: number; nextCursor: string | null };
    expect(second).toMatchObject({ skip: 2, nextCursor: null });
    expect(second.items).toHaveLength(1);
    expect(await titles('limit=1&skip=1')).toEqual(['B']);
    for (const bad of ['limit=0', 'limit=101', 'limit=x', 'skip=-1', 'cursor=abc', 'sort=title']) expect((await pub(`/content/article?${bad}`)).status, bad).toBe(400);
  });

  it('answers with an ETag and a 304 for If-None-Match, and a change gives a new tag', async () => {
    const { create, act, call, url } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' } } });
    await act(made.id, 'publish');
    const first = await fetch(`${url}/content/article`);
    const tag = first.headers.get('etag');
    expect(tag).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    expect((await fetch(`${url}/content/article`, { headers: { 'if-none-match': tag ?? '' } })).status).toBe(304);
    await call(`/content/entries/${String(made.id)}`, 'PUT', { values: { en: { title: 'Changed' } } });
    const after = await fetch(`${url}/content/article`, { headers: { 'if-none-match': tag ?? '' } });
    expect(after.status).toBe(200);
    expect(after.headers.get('etag')).not.toBe(tag);
  });

  it('needs no sign-in, is read-only, and HEAD works', async () => {
    const { create, act, url } = await setup();
    const made = await create({ type: 'article', values: { en: { title: 'T' } } });
    await act(made.id, 'publish');
    expect((await fetch(`${url}/content/article`, { headers: { authorization: 'Bearer nonsense' } })).status).toBe(200);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(`${url}/content/article`, { method, headers: { 'content-type': 'application/json' }, body: method === 'DELETE' ? undefined : '{}' });
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
    }
    expect((await fetch(`${url}/content/article/${String(made.id)}`, { method: 'DELETE' })).status).toBe(405);
    expect((await fetch(`${url}/content/article`, { method: 'HEAD' })).status).toBe(200);
  });

  it('describes the types at the mount itself', async () => {
    const { pub } = await setup();
    const root = (await (await pub('/content')).json()) as { locales: string[]; defaultLocale: string; types: { name: string; label: string; localized: boolean }[] };
    expect(root).toMatchObject({ locales: ['en', 'ar'], defaultLocale: 'en', types: [{ name: 'article', label: 'Article', localized: true }] });
  });

  it('honours basePath and a custom mount', async () => {
    const { pub } = await setup(definition({ basePath: '/api/v1', content: { mount: '/cms', locales: ['en', 'ar'], defaultLocale: 'en' } }));
    expect((await pub('/api/v1/cms/article')).status).toBe(200);
    expect((await pub('/content/article')).status).toBe(404);
    expect((await pub('/cms/article')).status).toBe(404);
  });

  it('does not touch the endpoints beside it', async () => {
    const { pub } = await setup(definition({ endpoints: [{ id: 's', type: 'static', method: 'GET', path: '/contents', body: { ok: true } }] }));
    expect(await (await pub('/contents')).json()).toEqual({ ok: true });
  });
});

describe('admin routes stay admin-only', () => {
  it('every content admin route is 404 on the public port and 401 without the token on the admin port', async () => {
    const { url, backend } = await setup();
    const admin = `http://127.0.0.1:${backend.admin.port}`;
    const routes = adminRouteList().filter((entry) => entry.includes('/__admin/content/'));
    expect(routes.length).toBeGreaterThanOrEqual(20);
    for (const entry of routes) {
      const [method, path] = entry.split(' ') as [string, string];
      expect((await fetch(`${url}${path}`, { method, headers: { authorization: `Bearer ${backend.admin.token}` } })).status, `${entry} public`).toBe(404);
      expect((await fetch(`${admin}${path}`, { method })).status, `${entry} no token`).toBe(401);
      expect((await fetch(`${admin}${path}`, { method, headers: { authorization: 'Bearer wrong' } })).status, `${entry} wrong token`).toBe(401);
    }
  });

  it('a public request cannot reach the admin content routes through the mount either', async () => {
    const { url } = await setup();
    expect((await fetch(`${url}/content/entries`)).status).toBe(404); // "entries" is not a type
    expect((await fetch(`${url}/content/../__admin/content/entries`)).status).toBe(404);
  });
});

describe('OpenAPI and the contract check', () => {
  it('describes the public content paths with typed fields', () => {
    const doc = buildOpenApi(parseBackend(definition({ basePath: '/api/v1' }))) as {
      paths: Record<string, Record<string, { parameters?: { name: string }[]; responses: Record<string, unknown> }>>;
      components: { schemas: Record<string, { properties: { fields: { properties: Record<string, unknown> } } }> };
    };
    expect(Object.keys(doc.paths).filter((path) => path.startsWith('/content'))).toEqual(['/content', '/content/article', '/content/article/{idOrSlug}']);
    expect(doc.paths['/content/article']?.get?.parameters?.map((param) => param.name)).toEqual(['locale', 'limit', 'skip', 'cursor', 'sort']);
    expect(Object.keys(doc.components.schemas.ContentArticle?.properties.fields.properties ?? {}).sort()).toEqual(article.fields.map((field) => field.name).sort());
    expect(doc.components.schemas).toHaveProperty('MediaFile');
  });

  it('serves it from the admin API and Swagger-style document', async () => {
    const { call } = await setup();
    const doc = (await (await call('/openapi')).json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toContain('/content/article');
  });
});

describe('snapshots keep content', () => {
  it('exports and imports types, entries, per-locale values, versions and status', async () => {
    const { create, act, call, dir, backend } = await setup();
    const made = await create({ type: 'article', slug: 'kept', values: { en: { title: 'Kept' }, ar: { title: 'محفوظ' } } });
    await act(made.id, 'publish');
    await call(`/content/entries/${String(made.id)}`, 'PUT', { values: { en: { title: 'Kept 2' } } });
    const draft = await create({ type: 'article', values: { en: { title: 'Draft' } } });
    void draft;
    await backend.stop();
    const zip = join(tempDir(), 'content.zip');
    await exportSnapshot({ dir }, zip);
    const restored = join(tempDir(), 'restored');
    await importSnapshot(zip, restored);
    const again = await startBackend(restored, { port: 0, host: '127.0.0.1', https: false, watch: false });
    try {
      const url = `http://127.0.0.1:${again.port}`;
      const list = (await (await fetch(`${url}/content/article?locale=ar`)).json()) as { total: number; items: { slug: string; fields: { title: string } }[] };
      expect(list.total).toBe(1); // the draft stays a draft
      expect(list.items[0]).toMatchObject({ slug: 'kept', fields: { title: 'محفوظ' } });
      expect(again.engine.content.detail(made.id as number)).toMatchObject({ status: 'published', version: 2, values: { en: { title: 'Kept 2' }, ar: { title: 'محفوظ' } } });
      expect(again.engine.content.versions(made.id as number).map((version) => version.version)).toEqual([2, 1]);
      expect(JSON.parse(readFileSync(join(restored, 'backend.json'), 'utf8')).contentTypes[0].name).toBe('article');
    } finally {
      await again.stop();
    }
  });
});

describe('seeds and reloads', () => {
  const seeded = (): BackendInput =>
    definition({ contentTypes: [{ ...articleType(), seed: [{ slug: 'welcome', status: 'published', values: { en: { title: 'Hi' }, ar: { title: 'أهلا' } } }, { slug: 'wip', status: 'draft', values: { en: { title: 'WIP' } } }] }] });

  it('creates the seed entries once, when the type is first created', async () => {
    const { pub, call, backend, dir } = await setup(seeded());
    expect(((await (await pub('/content/article?locale=ar')).json()) as { items: { fields: { title: string } }[] }).items.map((item) => item.fields.title)).toEqual(['أهلا']);
    expect(((await (await call('/content/entries?type=article')).json()) as { total: number }).total).toBe(2);
    await backend.stop();
    const again = await startBackend(dir, { port: 0, host: '127.0.0.1', https: false, watch: false });
    try {
      expect(again.engine.content.countEntries('article')).toBe(2); // not seeded a second time
    } finally {
      await again.stop();
    }
  });

  it('a hand edit of backend.json that removes a field with values is refused until confirmed in the app', async () => {
    const { backend, dir, create, call } = await setup();
    await create({ type: 'article', values: { en: { title: 'T', summary: 'S' } } });
    const file = join(dir, 'backend.json');
    const edited = JSON.parse(readFileSync(file, 'utf8')) as { contentTypes: { fields: { name: string }[] }[] };
    edited.contentTypes[0]!.fields = edited.contentTypes[0]!.fields.filter((field) => field.name !== 'summary');
    writeFileSync(file, JSON.stringify(edited));
    await expect(backend.manager.reloadFromDisk()).rejects.toThrow(/deletes? data/i);
    expect(backend.manager.lastReloadError).toContain('content article.summary');
    expect(((await (await call('/content/types/article')).json()) as { fields: { name: string }[] }).fields.some((field) => field.name === 'summary')).toBe(true);
  });
});
