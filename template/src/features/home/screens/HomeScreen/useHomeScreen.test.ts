import { waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { useAuthStore } from '@features/auth';
import { createUser } from '@test-utils/factories/user';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useHomeScreen } from './useHomeScreen';

const mockRefreshOnFocus = jest.fn();
jest.mock('@shared/hooks', () => ({
  ...jest.requireActual<Record<string, unknown>>('@shared/hooks'),
  useRefreshOnFocus: (refetch: unknown) => {
    mockRefreshOnFocus(refetch);
  },
}));

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

beforeEach(() => {
  mockRefreshOnFocus.mockClear();
  server.use(http.get('*/auth/me', () => HttpResponse.json({ message: 'no' }, { status: 401 })));
});

describe('useHomeScreen', () => {
  test('greets the stored user by first name', async () => {
    useAuthStore.setState({ status: 'signedIn', user: createUser({ firstName: 'Ada' }) });

    const { result } = await renderHookWithProviders(() => useHomeScreen());

    expect(result.current.greeting).toBe('Hello, Ada');
  });

  test('prefers the fresh query user over the stored one', async () => {
    useAuthStore.setState({ status: 'signedIn', user: createUser({ firstName: 'Ada' }) });
    server.use(http.get('*/auth/me', () => HttpResponse.json(createUser({ firstName: 'Grace' }))));

    const { result } = await renderHookWithProviders(() => useHomeScreen());

    await waitFor(() => {
      expect(result.current.greeting).toBe('Hello, Grace');
    });
  });

  test('falls back to the generic greeting without a user', async () => {
    useAuthStore.setState({ status: 'signedOut', user: null });

    const { result } = await renderHookWithProviders(() => useHomeScreen());

    expect(result.current.greeting).toBe('Hello');
  });

  test('refreshes the user when the screen regains focus', async () => {
    await renderHookWithProviders(() => useHomeScreen());

    expect(mockRefreshOnFocus).toHaveBeenCalledWith(expect.any(Function));
  });

  // @tempo-feature:samples:start
  test('onBrowseItems opens the items list', async () => {
    const { result } = await renderHookWithProviders(() => useHomeScreen());

    result.current.onBrowseItems();

    expect(mockNavigation.navigate).toHaveBeenCalledWith('ItemsList');
  });
  // @tempo-feature:samples:end
});
