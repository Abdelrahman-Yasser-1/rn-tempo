import { http, HttpResponse } from 'msw';

import { ENV } from '@config/env';
import { ApiError } from '@services/http/errors';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { initStorage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import { sanityClient } from './sanity';
import { CmsEntryError } from './schemas';

const QUERY_URL = 'https://abc123.apicdn.sanity.io/v2025-02-19/data/query/production';

const doc = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  _type: 'announcement',
  _updatedAt: '2026-11-24T12:00:00Z',
  slug: { current: id },
  publishedAt: '2026-11-20T09:00:00Z',
  title: { en: `Title ${id}`, ar: `عنوان ${id}` },
  body: { en: 'Body' },
  ...extra,
});

/** Answers every query with `result` and keeps the requests. */
function answer(result: unknown) {
  const seen: Request[] = [];
  server.use(
    http.get(QUERY_URL, ({ request }) => {
      seen.push(request);
      return HttpResponse.json({ ms: 3, query: '', result });
    }),
  );
  return seen;
}

let settings: ReturnType<typeof jest.replaceProperty>[] = [];

beforeAll(async () => {
  await initStorage();
});

beforeEach(() => {
  settings = [
    jest.replaceProperty(ENV, 'CMS_PROVIDER', 'sanity'),
    jest.replaceProperty(ENV, 'CMS_PROJECT_ID', 'abc123'),
    jest.replaceProperty(ENV, 'CMS_DATASET', 'production'),
    jest.replaceProperty(ENV, 'CMS_API_VERSION', undefined),
  ];
});

afterEach(async () => {
  for (const setting of settings) {
    setting.restore();
  }
  await tokenStore.clear();
});

describe('sanity adapter', () => {
  test('AC-C-2: maps documents to the shared envelope', async () => {
    answer([doc('one')]);

    const page = await sanityClient.getEntries('announcement', { locale: 'ar' });

    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        id: 'one',
        slug: 'one',
        type: 'announcement',
        locale: 'ar',
        availableLocales: expect.arrayContaining(['en', 'ar']) as string[],
        fallbackFields: ['body'],
        fields: { title: 'عنوان one', body: 'Body' },
        updatedAt: '2026-11-24T12:00:00Z',
        publishedAt: '2026-11-20T09:00:00Z',
      },
    ]);
  });

  test('AC-C-2: falls back to en for a locale a field lacks', async () => {
    answer([doc('one')]);

    const page = await sanityClient.getEntries('announcement', { locale: 'de' });

    expect(page.items[0]?.fields.title).toBe('Title one');
    expect(page.items[0]?.fallbackFields).toEqual(['title', 'body']);
  });

  test('AC-C-2: asks the CDN for published documents only, without drafts or a token', async () => {
    await tokenStore.setTokens({ accessToken: 'secret-access', refreshToken: 'secret-refresh' });
    const seen = answer([]);

    await sanityClient.getEntries('announcement', { locale: 'en' });

    const url = new URL(seen[0]?.url ?? '');
    expect(url.searchParams.get('perspective')).toBe('published');
    expect(url.searchParams.get('query')).toContain('!(_id in path("drafts.**"))');
    expect(url.searchParams.get('$type')).toBe('"announcement"');
    expect(seen[0]?.headers.get('authorization')).toBeNull();
  });

  test('AC-C-2: pages with a numeric offset cursor and one extra document', async () => {
    const seen = answer([doc('a'), doc('b'), doc('c')]);

    const page = await sanityClient.getEntries('announcement', { locale: 'en', limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toBe('2');
    const first = new URL(seen[0]?.url ?? '').searchParams;
    expect([first.get('$from'), first.get('$to')]).toEqual(['0', '3']);

    await sanityClient.getEntries('announcement', { locale: 'en', limit: 2, cursor: '2' });
    const next = new URL(seen[1]?.url ?? '').searchParams;
    expect([next.get('$from'), next.get('$to')]).toEqual(['2', '5']);
  });

  test('AC-C-2: the last page has no cursor', async () => {
    answer([doc('c')]);

    const page = await sanityClient.getEntries('announcement', {
      locale: 'en',
      limit: 2,
      cursor: '2',
    });

    expect(page.nextCursor).toBeNull();
  });

  test('AC-C-2: skips an invalid document and keeps the rest', async () => {
    answer([doc('bad', { title: { en: '' } }), doc('good')]);

    const page = await sanityClient.getEntries('announcement', { locale: 'en' });

    expect(page.items.map((item) => item.id)).toEqual(['good']);
  });

  test('AC-C-2: an empty result is an empty page', async () => {
    answer([]);

    await expect(sanityClient.getEntries('announcement', { locale: 'en' })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  test('AC-C-2: reads one document by id or slug', async () => {
    const seen = answer(doc('one'));

    const entry = await sanityClient.getEntry('announcement', 'one', { locale: 'en' });

    expect(entry.slug).toBe('one');
    expect(new URL(seen[0]?.url ?? '').searchParams.get('$key')).toBe('"one"');
  });

  test('AC-C-2: a missing document is a not-found CmsEntryError', async () => {
    answer(null);

    const failure = await sanityClient
      .getEntry('announcement', 'nope', { locale: 'en' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CmsEntryError);
    expect(failure).toMatchObject({ code: 'not-found' });
  });

  test('AC-C-2: an HTTP error is an ApiError', async () => {
    server.use(
      http.get(QUERY_URL, () =>
        HttpResponse.json(
          { error: { description: 'bad query', type: 'queryParseError' } },
          { status: 400 },
        ),
      ),
    );

    const failure = await sanityClient
      .getEntries('announcement', { locale: 'en' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 400, code: 'VALIDATION' });
  });

  test('AC-C-2: missing configuration fails on first use, not on import', async () => {
    settings.push(jest.replaceProperty(ENV, 'CMS_PROJECT_ID', undefined));

    await expect(sanityClient.getEntries('announcement', { locale: 'en' })).rejects.toThrow(
      'CMS_PROJECT_ID',
    );
  });

  test('AC-C-2: uses a configured API version', async () => {
    settings.push(jest.replaceProperty(ENV, 'CMS_API_VERSION', '2024-01-01'));
    const seen: string[] = [];
    server.use(
      http.get(
        'https://abc123.apicdn.sanity.io/v2024-01-01/data/query/production',
        ({ request }) => {
          seen.push(request.url);
          return HttpResponse.json({ ms: 1, result: [] });
        },
      ),
    );

    await sanityClient.getEntries('announcement', { locale: 'en' });

    expect(seen).toHaveLength(1);
  });
});
