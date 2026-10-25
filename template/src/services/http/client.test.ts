import { http, HttpResponse } from 'msw';

import { ENV } from '@config/env';
import { initI18nInstance } from '@services/i18n/i18n';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import { httpClient, resetBaseUrlCache } from './client';

type Seen = { authorization: string | null; language: string | null; requestId: string | null };

function captureHeaders(path: string): { seen: Seen[] } {
  const seen: Seen[] = [];
  server.use(
    http.get(`${ENV.API_BASE_URL}${path}`, ({ request }) => {
      seen.push({
        authorization: request.headers.get('authorization'),
        language: request.headers.get('accept-language'),
        requestId: request.headers.get('x-request-id'),
      });
      return HttpResponse.json({ ok: true });
    }),
  );
  return { seen };
}

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

beforeEach(async () => {
  storage.clearAll();
  resetBaseUrlCache();
  await tokenStore.clear();
});

describe('httpClient request interceptor', () => {
  test('AC-4: attaches the bearer token from the in-memory token store', async () => {
    await tokenStore.setTokens({ accessToken: 'tok-1', refreshToken: 'ref-1' });
    const { seen } = captureHeaders('/ping');

    await httpClient.get('/ping');

    expect(seen[0]?.authorization).toBe('Bearer tok-1');
  });

  test('AC-4: sends no Authorization header when signed out', async () => {
    const { seen } = captureHeaders('/ping');

    await httpClient.get('/ping');

    expect(seen[0]?.authorization).toBeNull();
  });

  test('AC-4: sends Accept-Language and a unique x-request-id', async () => {
    await initI18nInstance('ar');
    const { seen } = captureHeaders('/ping');

    await httpClient.get('/ping');
    await httpClient.get('/ping');
    await initI18nInstance('en');

    expect(seen[0]?.language).toBe('ar');
    expect(seen[0]?.requestId).toMatch(/^[\da-f]{16}$/);
    expect(seen[0]?.requestId).not.toBe(seen[1]?.requestId);
  });

  test('AC-4: uses the stored base URL override in non-prod builds', async () => {
    storage.setString(STORAGE_KEYS.apiBaseUrlOverride, 'https://staging.example.test');
    server.use(
      http.get('https://staging.example.test/ping', () => HttpResponse.json({ from: 'override' })),
    );

    const response = await httpClient.get<{ from: string }>('/ping');

    expect(response.data.from).toBe('override');
  });
});
