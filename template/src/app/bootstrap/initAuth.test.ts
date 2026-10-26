import { http, HttpResponse } from 'msw';

import { ENV } from '@config/env';
import { useAuthStore } from '@features/auth';
import { queryClient } from '@services/http/queryClient';
import { initI18nInstance } from '@services/i18n/i18n';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { initStorage } from '@services/storage/storage';
import { createUser } from '@test-utils/factories/user';
import { server } from '@test-utils/msw/server';

import { initAuth } from './initAuth';

const tokens = { accessToken: 'access', refreshToken: 'refresh' };
const meUrl = `${ENV.API_BASE_URL}/auth/me`;

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

beforeEach(async () => {
  await tokenStore.clear();
  queryClient.clear();
  useAuthStore.setState({ status: 'unknown', user: null, pendingLink: null });
});

describe('initAuth', () => {
  test('AC-8: no stored token signs out', async () => {
    await initAuth();

    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  test('AC-8: a stored token plus a valid /auth/me signs in', async () => {
    const user = createUser();
    await tokenStore.setTokens(tokens);
    // Simulate a cold start: only the keychain keeps the tokens.
    server.use(http.get(meUrl, () => HttpResponse.json(user)));

    await initAuth();

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', user });
  });

  test('AC-8: a rejected token (refresh also fails) signs out and wipes tokens', async () => {
    await tokenStore.setTokens(tokens);
    server.use(
      http.get(meUrl, () => HttpResponse.json({ message: 'expired' }, { status: 401 })),
      http.post(`${ENV.API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json({ message: 'bad' }, { status: 401 }),
      ),
    );

    await initAuth();

    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(tokenStore.hasTokens()).toBe(false);
  });

  test('AC-8: an expired access token is refreshed transparently', async () => {
    const user = createUser();
    await tokenStore.setTokens(tokens);
    server.use(
      http.get(meUrl, ({ request }) =>
        request.headers.get('authorization') === 'Bearer fresh'
          ? HttpResponse.json(user)
          : HttpResponse.json({}, { status: 401 }),
      ),
      http.post(`${ENV.API_BASE_URL}/auth/refresh`, () =>
        HttpResponse.json({ accessToken: 'fresh', refreshToken: 'refresh-2' }),
      ),
    );

    await initAuth();

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', user });
    expect(tokenStore.getAccessToken()).toBe('fresh');
  });

  test('AC-8: being offline keeps the tokens and enters signed in without a user', async () => {
    await tokenStore.setTokens(tokens);
    server.use(http.get(meUrl, () => HttpResponse.error()));

    await initAuth();

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', user: null });
    expect(tokenStore.hasTokens()).toBe(true);
  });
});
