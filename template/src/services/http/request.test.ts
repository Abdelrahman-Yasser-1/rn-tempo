import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';

import { ENV } from '@config/env';
import { initI18nInstance } from '@services/i18n/i18n';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { initStorage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import { ApiError } from './errors';
import { request } from './request';

const UserSchema = z.object({ id: z.number(), name: z.string() });

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

beforeEach(async () => {
  await tokenStore.clear();
});

describe('request', () => {
  test('returns validated, typed data', async () => {
    server.use(
      http.get(`${ENV.API_BASE_URL}/user`, () => HttpResponse.json({ id: 1, name: 'Emily' })),
    );

    await expect(request({ url: '/user' }, UserSchema)).resolves.toEqual({ id: 1, name: 'Emily' });
  });

  test('AC-4: a schema mismatch becomes an ApiError with code UNKNOWN', async () => {
    server.use(
      http.get(`${ENV.API_BASE_URL}/user`, () => HttpResponse.json({ id: 'one', name: 3 })),
    );

    const failure = await request({ url: '/user' }, UserSchema).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: 'UNKNOWN' });
  });

  test('AC-4: a timeout becomes an ApiError with code TIMEOUT', async () => {
    server.use(
      http.get(`${ENV.API_BASE_URL}/slow`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );

    await expect(request({ url: '/slow', timeout: 30 }, z.object({}))).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  test('HTTP errors become ApiError with the mapped code', async () => {
    server.use(
      http.get(`${ENV.API_BASE_URL}/missing`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );

    await expect(request({ url: '/missing' }, z.object({}))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Not found',
    });
  });

  test('AC-4: a connection failure becomes NETWORK', async () => {
    server.use(http.get(`${ENV.API_BASE_URL}/down`, () => HttpResponse.error()));

    await expect(request({ url: '/down' }, z.object({}))).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });
});
