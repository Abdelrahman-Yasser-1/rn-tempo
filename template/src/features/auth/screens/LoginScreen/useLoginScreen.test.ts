import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { useNetworkStore } from '@services/network/network';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { fillFields } from '@test-utils/form';
import { MOCK_ACCESS_TOKEN, MOCK_CREDENTIALS } from '@test-utils/msw/routes';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useAuthStore } from '../../store/auth.store';

import { useLoginScreen } from './useLoginScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(async () => {
  mockNavigation.navigate.mockClear();
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
  useAuthStore.setState({ status: 'signedOut', user: null, pendingLink: null });
  await tokenStore.clear();
});

async function submitWith(values: { username: string; password: string }) {
  const view = await renderHookWithProviders(() => useLoginScreen());
  await fillFields(view.result.current.control, values);
  await act(() => {
    view.result.current.onSubmit();
    return Promise.resolve();
  });
  return view;
}

describe('useLoginScreen', () => {
  test('starts without an error and not pending', async () => {
    const { result } = await renderHookWithProviders(() => useLoginScreen());

    expect(result.current.errorMessage).toBeUndefined();
    expect(result.current.isPending).toBe(false);
  });

  test('valid credentials sign the user in', async () => {
    await submitWith(MOCK_CREDENTIALS);

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signedIn');
    });
    expect(tokenStore.getAccessToken()).toBe(MOCK_ACCESS_TOKEN);
  });

  test('wrong credentials map to the invalid-credentials message', async () => {
    const { result } = await submitWith({ username: MOCK_CREDENTIALS.username, password: 'nope' });

    await waitFor(() => {
      expect(result.current.errorMessage).toBe('Incorrect username or password.');
    });
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  test('a server error maps to the generic server message', async () => {
    server.use(
      http.post('*/auth/login', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const { result } = await submitWith(MOCK_CREDENTIALS);

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(
        'Something went wrong on our side. Please try again later.',
      );
    });
  });

  test('submitting offline sets the offline message and sends nothing', async () => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: false });
    const { result } = await submitWith(MOCK_CREDENTIALS);

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(
        'No internet connection. Check your network and try again.',
      );
    });
    expect(result.current.isPending).toBe(false);
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  test('invalid fields send no request and set no error message', async () => {
    const { result } = await submitWith({ username: '', password: '' });

    expect(result.current.errorMessage).toBeUndefined();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  test('the link handlers navigate to ForgotPassword and Register', async () => {
    const { result } = await renderHookWithProviders(() => useLoginScreen());

    result.current.onForgotPassword();
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('ForgotPassword');

    result.current.onRegister();
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('Register');
  });
});
