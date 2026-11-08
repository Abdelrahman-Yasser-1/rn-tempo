import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { useAuthStore } from '@features/auth/store/auth.store';
import { useNetworkStore } from '@services/network/network';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { MOCK_ACCESS_TOKEN, MOCK_CREDENTIALS } from '@test-utils/msw/routes';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { LoginScreen } from './LoginScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
});

async function renderLogin() {
  const view = await renderWithProviders(<LoginScreen />);
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
});

describe('LoginScreen', () => {
  test('lays out the title, subtitle and links with the Maestro test IDs, and no header', async () => {
    await renderLogin();

    /* eslint-disable rn-tempo/discouraged-syntax -- Maestro flows address these IDs */
    expect(screen.getByTestId('login-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('login.forgot-password-link')).toBeOnTheScreen();
    expect(screen.getByTestId('login.register-link')).toBeOnTheScreen();
    expect(screen.getByTestId('login.submit-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('login.header')).not.toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax */
    expect(screen.getByRole('header', { name: 'Welcome back' })).toBeOnTheScreen();
    expect(screen.getByText('Sign in to continue.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeOnTheScreen();
  });

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
    const { user } = await renderLogin();

    await user.press(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('ForgotPassword');

    await user.press(screen.getByRole('button', { name: 'Create account' }));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('Register');
  });
});
