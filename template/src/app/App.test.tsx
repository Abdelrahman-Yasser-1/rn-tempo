import { act, render, screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { Linking } from 'react-native';
import BootSplash from 'react-native-bootsplash';

import { ENV } from '@config/env';
import { useAuthStore } from '@features/auth';
import { queryClient } from '@services/http/queryClient';
import { tokenStore } from '@services/secure-storage/tokenStore';
import {
  MOCK_ACCESS_TOKEN,
  MOCK_REFRESH_TOKEN,
  mockAppConfig,
  mockUser,
} from '@test-utils/msw/routes';
import { server } from '@test-utils/msw/server';

import { App } from './App';
import { useSecurityStore } from './bootstrap/securityStore';

const configUrl = `${ENV.API_BASE_URL}${ENV.APP_CONFIG_PATH}`;

beforeEach(async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  await tokenStore.clear();
  queryClient.clear();
  useAuthStore.setState({ status: 'unknown', user: null, pendingLink: null });
  useSecurityStore.setState({ compromisedReasons: [] });
  jest.mocked(BootSplash.hide).mockClear();
});

describe('App', () => {
  test('AC-9: a cold start with no session lands on Login and hides the splash', async () => {
    await render(<App />);

    expect(await screen.findByText('Login')).toBeOnTheScreen();
    expect(BootSplash.hide).toHaveBeenCalledWith({ fade: true });
  });

  test('AC-9: signing in reaches the Home placeholder', async () => {
    await render(<App />);
    await screen.findByText('Login');

    await act(async () => {
      await useAuthStore
        .getState()
        .signIn({ accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN }, mockUser);
    });

    expect(await screen.findByText('This screen is not built yet.')).toBeOnTheScreen();
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
  });

  test('AC-9: a stored session skips Login and opens Home', async () => {
    await tokenStore.setTokens({
      accessToken: MOCK_ACCESS_TOKEN,
      refreshToken: MOCK_REFRESH_TOKEN,
    });

    await render(<App />);

    expect((await screen.findAllByText('Home')).length).toBeGreaterThan(0);
    expect(useAuthStore.getState().user).toMatchObject({ username: 'emilys' });
  });

  test('a too-old version is stopped at the force update screen', async () => {
    server.use(
      http.get(configUrl, () =>
        HttpResponse.json({
          ...mockAppConfig,
          minSupportedVersion: { ios: '99.0.0', android: '99.0.0' },
        }),
      ),
    );

    await render(<App />);

    expect(await screen.findByRole('header', { name: 'Update required' })).toBeOnTheScreen();
  });

  test('maintenance mode is stopped at the maintenance screen', async () => {
    server.use(
      http.get(configUrl, () =>
        HttpResponse.json({
          ...mockAppConfig,
          maintenance: { enabled: true, message: 'Back soon' },
        }),
      ),
    );

    await render(<App />);

    expect(await screen.findByText('Back soon')).toBeOnTheScreen();
  });

  test('a runtime pin mismatch replaces the app with the security screen', async () => {
    await render(<App />);
    await screen.findByText('Login');

    await act(() => {
      useSecurityStore.getState().reportCompromise('ssl');
    });

    expect(
      await screen.findByRole('header', { name: 'Security issue detected' }),
    ).toBeOnTheScreen();
  });
});
