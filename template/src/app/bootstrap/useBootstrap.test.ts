import { act, renderHook, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import BootSplash from 'react-native-bootsplash';

import { ENV } from '@config/env';
import { useAuthStore } from '@features/auth';
import { httpClient, setUnauthorizedHandler } from '@services/http/client';
import { initI18nInstance } from '@services/i18n/i18n';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { initStorage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import { useBootstrap } from './useBootstrap';

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

beforeEach(async () => {
  await tokenStore.clear();
  useAuthStore.setState({ status: 'unknown', user: null, pendingLink: null });
  server.use(
    http.get(`${ENV.API_BASE_URL}${ENV.APP_CONFIG_PATH}`, () =>
      HttpResponse.json({}, { status: 404 }),
    ),
  );
});

afterAll(() => {
  setUnauthorizedHandler(undefined);
});

describe('useBootstrap', () => {
  test('AC-9: signed-out cold start becomes ready and hides the splash', async () => {
    const { result } = await renderHook(() => useBootstrap());
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(BootSplash.hide).toHaveBeenCalledWith({ fade: true });
  });

  test('AC-8: registers the unauthorized handler that signs the user out', async () => {
    await tokenStore.setTokens({ accessToken: 'a', refreshToken: 'r' });
    useAuthStore.setState({ status: 'signedIn' });
    await renderHook(() => useBootstrap());
    await waitFor(() => {
      expect(BootSplash.hide).toHaveBeenCalled();
    });
    useAuthStore.setState({ status: 'signedIn' });

    await act(async () => {
      server.use(
        http.get(`${ENV.API_BASE_URL}/secure`, () => HttpResponse.json({}, { status: 401 })),
      );
      await httpClient.get('/secure').catch(jest.fn());
    });

    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});
