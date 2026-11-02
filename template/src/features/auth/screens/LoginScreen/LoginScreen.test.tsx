import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';

import { useNetworkStore } from '@services/network/network';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { MOCK_ACCESS_TOKEN, MOCK_CREDENTIALS } from '@test-utils/msw/routes';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { useAuthStore } from '../../store/auth.store';

import { LoginScreen } from './LoginScreen';

type LoginProps = ComponentProps<typeof LoginScreen>;

function makeNavigation() {
  return { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

// Mutations schedule 5-minute gc timers on the per-test client; releasing it lets Jest exit.
/** clear() leaves each mutation's 5-minute gc timer running; destroy() cancels it first. */
function releaseClient(client: QueryClient | undefined) {
  for (const mutation of client?.getMutationCache().getAll() ?? []) {
    mutation.destroy();
  }
  client?.clear();
}

let renderedClient: QueryClient | undefined;

async function renderLogin(navigation = makeNavigation()) {
  const props = { navigation, route: { key: 'Login', name: 'Login' } } as unknown as LoginProps;
  const view = await renderWithProviders(<LoginScreen {...props} />);
  renderedClient = view.queryClient;
  return view;
}

function setOffline() {
  useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
}

const requestedUrls: string[] = [];

beforeEach(async () => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
  useAuthStore.setState({ status: 'signedOut', user: null, pendingLink: null });
  await tokenStore.clear();
  server.events.on('request:start', ({ request }) => {
    requestedUrls.push(request.url);
  });
});

afterEach(() => {
  requestedUrls.length = 0;
  server.events.removeAllListeners();
  releaseClient(renderedClient);
  renderedClient = undefined;
});

describe('LoginScreen', () => {
  test('AC-1: valid credentials store the tokens and sign the user in', async () => {
    const { user } = await renderLogin();

    await user.type(screen.getByLabelText('Username'), MOCK_CREDENTIALS.username);
    await user.type(screen.getByLabelText('Password'), MOCK_CREDENTIALS.password);
    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signedIn');
    });
    expect(tokenStore.getAccessToken()).toBe(MOCK_ACCESS_TOKEN);
    expect(useAuthStore.getState().user).toMatchObject({ username: MOCK_CREDENTIALS.username });
  });

  test('AC-2: a wrong password shows the invalid-credentials error and keeps the user signed out', async () => {
    const { user } = await renderLogin();

    await user.type(screen.getByLabelText('Username'), MOCK_CREDENTIALS.username);
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect username or password.')).toBeOnTheScreen();
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(tokenStore.hasTokens()).toBe(false);
  });

  test('AC-3: submitting while offline shows the offline error and sends no request', async () => {
    setOffline();
    const { user } = await renderLogin();

    await user.type(screen.getByLabelText('Username'), MOCK_CREDENTIALS.username);
    await user.type(screen.getByLabelText('Password'), MOCK_CREDENTIALS.password);
    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('No internet connection. Check your network and try again.'),
    ).toBeOnTheScreen();
    expect(requestedUrls).toEqual([]);
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  test('empty fields show the validation messages and send no request', async () => {
    const { user } = await renderLogin();

    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your username.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(requestedUrls).toEqual([]);
  });

  test('a server error shows the mapped generic message', async () => {
    server.use(
      http.post('*/auth/login', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const { user } = await renderLogin();

    await user.type(screen.getByLabelText('Username'), MOCK_CREDENTIALS.username);
    await user.type(screen.getByLabelText('Password'), MOCK_CREDENTIALS.password);
    await user.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Something went wrong on our side. Please try again later.'),
    ).toBeOnTheScreen();
  });

  test('the forgot-password and create-account links navigate', async () => {
    const navigation = makeNavigation();
    const { user } = await renderLogin(navigation);

    await user.press(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ForgotPassword');

    await user.press(screen.getByRole('button', { name: 'Create account' }));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Register');
  });
});
