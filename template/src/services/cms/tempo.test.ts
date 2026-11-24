import { http, HttpResponse, passthrough } from 'msw';

import { ENV } from '@config/env';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { initStorage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import { CmsEntryError } from './schemas';
import { tempoClient } from './tempo';

const LIST_URL = `${ENV.API_BASE_URL}/content/announcement`;

/** Lets every request through to the backend and keeps its URL and headers. */
function recordRequests() {
  const seen: { url: URL; headers: Headers }[] = [];
  server.use(
    http.get(`${ENV.API_BASE_URL}/content/*`, ({ request }) => {
      seen.push({ url: new URL(request.url), headers: request.headers });
      return passthrough();
    }),
  );
  return seen;
}

beforeAll(async () => {
  await initStorage();
});

afterEach(async () => {
  await tokenStore.clear();
});

describe('tempo adapter', () => {
  test('AC-C-2: lists published entries in English', async () => {
    const page = await tempoClient.getEntries('announcement', { locale: 'en' });

    expect(page.nextCursor).toBeNull();
    expect(page.items.map((item) => item.slug)).toEqual(
      expect.arrayContaining(['release-notes', 'welcome']),
    );
    const welcome = page.items.find((item) => item.slug === 'welcome');
    expect(welcome).toMatchObject({
      type: 'announcement',
      locale: 'en',
      fallbackFields: [],
      fields: { title: 'Welcome to Tempo', ctaLabel: 'Learn more' },
    });
  });

  test('AC-C-2: lists entries in Arabic', async () => {
    const page = await tempoClient.getEntries('announcement', { locale: 'ar' });

    const welcome = page.items.find((item) => item.slug === 'welcome');
    expect(welcome?.locale).toBe('ar');
    expect(welcome?.fields.title).toBe('مرحبًا بك في Tempo');
  });

  test('AC-C-2: reads one entry by slug', async () => {
    const entry = await tempoClient.getEntry('announcement', 'release-notes', { locale: 'en' });

    expect(entry).toMatchObject({ slug: 'release-notes', fields: { title: 'Release notes' } });
  });

  test('AC-C-2: a missing entry is a not-found CmsEntryError', async () => {
    const failure = await tempoClient
      .getEntry('announcement', 'nope', { locale: 'en' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CmsEntryError);
    expect(failure).toMatchObject({ code: 'not-found' });
  });

  test('AC-C-2: pages with limit and the backend cursor', async () => {
    const first = await tempoClient.getEntries('announcement', { locale: 'en', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe('2');

    const second = await tempoClient.getEntries('announcement', {
      locale: 'en',
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  test('AC-C-2: lists entries in every app language, with the server-side fallback to en', async () => {
    const page = await tempoClient.getEntries('announcement', { locale: 'de' });

    const welcome = page.items.find((item) => item.slug === 'welcome');
    expect(welcome).toMatchObject({ locale: 'de', fields: { title: 'Willkommen bei Tempo' } });
    const gettingStarted = page.items.find((item) => item.slug === 'getting-started');
    expect(gettingStarted).toMatchObject({
      locale: 'de',
      fallbackFields: ['body'],
      fields: { title: 'Tipps für den Einstieg' },
    });
    expect(gettingStarted?.fields.body).toContain('Quick tips');
  });

  test('AC-C-2: retries once with en when the backend does not know the locale', async () => {
    const seen = recordRequests();

    const page = await tempoClient.getEntries('announcement', { locale: 'it' });

    expect(seen.map((request) => request.url.searchParams.get('locale'))).toEqual(['it', 'en']);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.locale === 'en')).toBe(true);
  });

  test('AC-C-2: does not retry a 400 that is not about the locale', async () => {
    let calls = 0;
    server.use(
      http.get(LIST_URL, () => {
        calls += 1;
        return HttpResponse.json(
          { errors: [{ path: 'limit', message: 'Use a number from 1 to 100.' }] },
          { status: 400 },
        );
      }),
    );

    await expect(tempoClient.getEntries('announcement', { locale: 'it' })).rejects.toMatchObject({
      status: 400,
    });
    expect(calls).toBe(1);
  });

  test('AC-C-2: asks again with If-None-Match and serves the cached body on 304', async () => {
    const seen = recordRequests();

    const first = await tempoClient.getEntries('announcement', { locale: 'en', limit: 3 });
    const second = await tempoClient.getEntries('announcement', { locale: 'en', limit: 3 });

    expect(second).toEqual(first);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.headers.get('if-none-match')).toBeNull();
    expect(seen[1]?.headers.get('if-none-match')).toMatch(/^W\//);
  });

  test('AC-C-2: serves the cached body when the server answers 304', async () => {
    let calls = 0;
    server.use(
      http.get(`${ENV.API_BASE_URL}/content/announcement/cached`, ({ request }) => {
        calls += 1;
        if (request.headers.get('if-none-match') === 'W/"v1"') {
          return new HttpResponse(null, { status: 304, headers: { etag: 'W/"v1"' } });
        }
        return HttpResponse.json(
          {
            id: 9,
            type: 'announcement',
            slug: 'cached',
            locale: 'en',
            availableLocales: ['en'],
            fallbackFields: [],
            publishedAt: null,
            updatedAt: '2026-11-24T12:00:00Z',
            fields: { title: 'From the cache' },
          },
          { headers: { etag: 'W/"v1"' } },
        );
      }),
    );

    const first = await tempoClient.getEntry('announcement', 'cached', { locale: 'en' });
    const second = await tempoClient.getEntry('announcement', 'cached', { locale: 'en' });

    expect(calls).toBe(2);
    expect(second).toEqual(first);
    expect(second.fields.title).toBe('From the cache');
  });

  test('AC-C-2: never sends the bearer token with a content request', async () => {
    await tokenStore.setTokens({ accessToken: 'secret-access', refreshToken: 'secret-refresh' });
    const seen = recordRequests();

    await tempoClient.getEntries('announcement', { locale: 'en', limit: 3 });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers.get('authorization')).toBeNull();
  });

  test('AC-C-2: skips an invalid item and keeps the rest', async () => {
    const valid = {
      id: 1,
      type: 'announcement',
      slug: 'ok',
      locale: 'en',
      availableLocales: ['en'],
      fallbackFields: [],
      publishedAt: null,
      updatedAt: '2026-11-24T12:00:00Z',
      fields: { title: 'Fine' },
    };
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({
          items: [{ ...valid, id: 2, fields: { title: '' } }, valid],
          nextCursor: null,
        }),
      ),
    );

    const page = await tempoClient.getEntries('announcement', { locale: 'en' });

    expect(page.items.map((item) => item.id)).toEqual([1]);
  });
});
