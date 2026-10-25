import { delay, http, HttpResponse } from 'msw';

import { ENV } from '@config/env';
import { initI18nInstance } from '@services/i18n/i18n';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import { httpClient, resetBaseUrlCache, setUnauthorizedHandler } from './client';

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

describe('httpClient token refresh', () => {
  const unauthorized = jest.fn();
  let refreshCalls = 0;

  beforeEach(async () => {
    unauthorized.mockClear();
    refreshCalls = 0;
    setUnauthorizedHandler(unauthorized);
    await tokenStore.setTokens({ accessToken: 'old', refreshToken: 'ref-old' });
  });

  afterAll(() => {
    setUnauthorizedHandler(undefined);
  });

  const protectedHandler = (calls: string[]) =>
    http.get(`${ENV.API_BASE_URL}/secure`, ({ request }) => {
      const auth = request.headers.get('authorization') ?? '';
      calls.push(auth);
      return auth === 'Bearer new'
        ? HttpResponse.json({ ok: true })
        : HttpResponse.json({ message: 'expired' }, { status: 401 });
    });

  const refreshHandler = (status = 200) =>
    http.post(`${ENV.API_BASE_URL}/auth/refresh`, async () => {
      refreshCalls += 1;
      await delay(20);
      return status === 200
        ? HttpResponse.json({ accessToken: 'new', refreshToken: 'ref-new' })
        : HttpResponse.json({ message: 'bad refresh token' }, { status });
    });

  test('AC-4: a 401 refreshes the token and replays the request once', async () => {
    const calls: string[] = [];
    server.use(protectedHandler(calls), refreshHandler());

    const response = await httpClient.get<{ ok: boolean }>('/secure');

    expect(response.data.ok).toBe(true);
    expect(calls).toEqual(['Bearer old', 'Bearer new']);
    expect(refreshCalls).toBe(1);
    expect(tokenStore.getRefreshToken()).toBe('ref-new');
    expect(unauthorized).not.toHaveBeenCalled();
  });

  test('AC-4: concurrent 401s trigger exactly one refresh call', async () => {
    const calls: string[] = [];
    server.use(protectedHandler(calls), refreshHandler());

    const results = await Promise.all([
      httpClient.get('/secure'),
      httpClient.get('/secure'),
      httpClient.get('/secure'),
    ]);

    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(calls.filter((value) => value === 'Bearer new')).toHaveLength(3);
  });

  test('AC-4: a failed refresh calls the unauthorized handler and rejects', async () => {
    const calls: string[] = [];
    server.use(protectedHandler(calls), refreshHandler(401));

    await expect(httpClient.get('/secure')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(refreshCalls).toBe(1);
  });

  test('AC-4: with no refresh token a 401 signs out without calling the refresh endpoint', async () => {
    jest.spyOn(tokenStore, 'getRefreshToken').mockReturnValue(null);
    server.use(
      http.get(`${ENV.API_BASE_URL}/secure`, () => HttpResponse.json({}, { status: 401 })),
      refreshHandler(),
    );

    await expect(httpClient.get('/secure')).rejects.toBeDefined();

    expect(refreshCalls).toBe(0);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  test('AC-4: a replayed request that is rejected again signs out without looping', async () => {
    server.use(
      http.get(`${ENV.API_BASE_URL}/secure`, () => HttpResponse.json({}, { status: 401 })),
      refreshHandler(),
    );

    await expect(httpClient.get('/secure')).rejects.toBeDefined();

    expect(refreshCalls).toBe(1);
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  test('AC-4: an anonymous 401 (e.g. bad login) neither refreshes nor signs out', async () => {
    await tokenStore.clear();
    server.use(
      http.post(`${ENV.API_BASE_URL}/auth/login`, () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    await expect(httpClient.post('/auth/login', {})).rejects.toBeDefined();

    expect(unauthorized).not.toHaveBeenCalled();
    expect(refreshCalls).toBe(0);
  });
});
