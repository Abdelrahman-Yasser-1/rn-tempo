import { waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { setUnauthorizedHandler } from '@services/http/client';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN, mockUser } from '@test-utils/msw/routes';
import { server } from '@test-utils/msw/server';

import { useAuthStore } from '../store/auth.store';

import { fetchMe } from './auth.api';

const unauthorized = (message: string) => HttpResponse.json({ message }, { status: 401 });

beforeEach(async () => {
  await tokenStore.clear();
  useAuthStore.setState({ status: 'signedIn', user: mockUser, pendingLink: null });
  // Same wiring as bootstrap (useBootstrap): an unrecoverable session signs the user out.
  setUnauthorizedHandler(() => {
    void useAuthStore.getState().signOut();
  });
});

afterEach(() => {
  setUnauthorizedHandler(undefined);
});

describe('auth api session recovery', () => {
  test('AC-6: a refresh rejected with 401 signs the user out and clears the tokens', async () => {
    await tokenStore.setTokens({ accessToken: 'expired-access', refreshToken: 'revoked-refresh' });
    server.use(
      http.get('*/auth/me', () => unauthorized('Invalid or expired token')),
      http.post('*/auth/refresh', () => unauthorized('Invalid refresh token')),
    );

    await expect(fetchMe()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signedOut');
    });
    expect(useAuthStore.getState().user).toBeNull();
    expect(tokenStore.hasTokens()).toBe(false);
  });

  test('a 401 is recovered by a successful refresh and the request is replayed', async () => {
    await tokenStore.setTokens({ accessToken: 'expired-access', refreshToken: MOCK_REFRESH_TOKEN });
    server.use(
      http.get('*/auth/me', ({ request }) =>
        request.headers.get('authorization') === `Bearer ${MOCK_ACCESS_TOKEN}`
          ? HttpResponse.json(mockUser)
          : unauthorized('Invalid or expired token'),
      ),
    );

    await expect(fetchMe()).resolves.toMatchObject({ username: mockUser.username });

    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(tokenStore.getAccessToken()).toBe(MOCK_ACCESS_TOKEN);
  });

  test('a refresh that fails with a server error keeps the session', async () => {
    await tokenStore.setTokens({ accessToken: 'expired-access', refreshToken: 'some-refresh' });
    server.use(
      http.get('*/auth/me', () => unauthorized('Invalid or expired token')),
      http.post('*/auth/refresh', () => HttpResponse.json({}, { status: 503 })),
    );

    await expect(fetchMe()).rejects.toMatchObject({ code: 'SERVER' });

    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(tokenStore.hasTokens()).toBe(true);
  });
});
