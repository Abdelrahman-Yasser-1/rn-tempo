import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios, { AxiosHeaders } from 'axios';

import { MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN, mockUser } from '@test-utils/msw/routes';

import { createDevMockAdapter, DEV_MOCK_LATENCY_MS } from './devMockAdapter';

const BASE = 'https://api.example.test';

function fallbackAdapter() {
  return jest.fn<Promise<AxiosResponse>, [InternalAxiosRequestConfig]>((config) =>
    Promise.resolve({ data: 'real', status: 200, statusText: 'OK', headers: {}, config }),
  );
}

function clientWith(adapter: AxiosAdapter) {
  return axios.create({ baseURL: BASE, adapter });
}

describe('createDevMockAdapter', () => {
  test('AC-9: answers a matching route from the shared table', async () => {
    const fallback = fallbackAdapter();
    const client = clientWith(createDevMockAdapter({ fallback, latencyMs: 0 }));

    const response = await client.post<{ accessToken: string; username: string }>('/auth/login', {
      username: 'emilys',
      password: 'emilyspass',
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({ username: 'emilys', accessToken: MOCK_ACCESS_TOKEN });
    expect(fallback).not.toHaveBeenCalled();
  });

  test('AC-9: parses JSON bodies and reads lower-cased headers', async () => {
    const client = clientWith(createDevMockAdapter({ fallback: fallbackAdapter(), latencyMs: 0 }));

    const me = await client.get('/auth/me', {
      headers: new AxiosHeaders({ Authorization: `Bearer ${MOCK_ACCESS_TOKEN}` }),
    });
    const refreshed = await client.post<{ accessToken: string }>('/auth/refresh', {
      refreshToken: MOCK_REFRESH_TOKEN,
    });

    expect(me.data).toEqual(mockUser);
    expect(refreshed.data.accessToken).toBe(MOCK_ACCESS_TOKEN);
  });

  test('AC-9: non-2xx mock responses reject like a real server error', async () => {
    const client = clientWith(createDevMockAdapter({ fallback: fallbackAdapter(), latencyMs: 0 }));

    await expect(
      client.post('/auth/login', { username: 'emilys', password: 'nope' }),
    ).rejects.toMatchObject({
      response: { status: 400, data: { message: 'Invalid credentials' } },
    });
    await expect(client.get('/auth/me')).rejects.toMatchObject({ response: { status: 401 } });
  });

  test('AC-9: unmatched requests fall through to the real adapter', async () => {
    const fallback = fallbackAdapter();
    const client = clientWith(createDevMockAdapter({ fallback, latencyMs: 0 }));

    const response = await client.get('/products/1');

    expect(response.data).toBe('real');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  test('AC-9: a matching path with a different method also falls through', async () => {
    const fallback = fallbackAdapter();
    const client = clientWith(createDevMockAdapter({ fallback, latencyMs: 0 }));

    await client.get('/auth/login');

    expect(fallback).toHaveBeenCalledTimes(1);
  });

  test('AC-9: ignores the query string when matching and exposes it to the route', async () => {
    const resolve = jest.fn(() => ({ status: 200, body: { ok: true } }));
    const client = clientWith(
      createDevMockAdapter({
        fallback: fallbackAdapter(),
        latencyMs: 0,
        routes: [{ method: 'get', path: '/search/:kind', resolve }],
      }),
    );

    await client.get('/search/items?q=phone', { params: { limit: 5 } });

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ params: { kind: 'items' }, query: { q: 'phone', limit: '5' } }),
    );
  });

  test('AC-9: adds artificial latency to mocked responses only', async () => {
    jest.useFakeTimers();
    const fallback = fallbackAdapter();
    const client = clientWith(createDevMockAdapter({ fallback, latencyMs: 300 }));
    let isDone = false;

    const pending = (async () => {
      await client.get('/app-config');
      isDone = true;
    })();
    await jest.advanceTimersByTimeAsync(299);
    expect(isDone).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;

    expect(isDone).toBe(true);
    jest.useRealTimers();
  });

  test('AC-9: the default latency is 300 ms', () => {
    expect(DEV_MOCK_LATENCY_MS).toBe(300);
  });
});
