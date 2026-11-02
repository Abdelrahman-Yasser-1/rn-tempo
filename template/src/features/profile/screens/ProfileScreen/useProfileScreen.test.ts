import { waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { useAuthStore } from '@features/auth';
import { createUser } from '@test-utils/factories/user';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useProfileScreen } from './useProfileScreen';

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

const STORED = createUser({ firstName: 'Ada', lastName: 'Lovelace' });
const FRESH = createUser({ firstName: 'Grace', lastName: 'Hopper' });

describe('useProfileScreen', () => {
  test('uses the stored user while the query has no data', async () => {
    server.use(http.get('*/auth/me', () => HttpResponse.json({ message: 'no' }, { status: 401 })));
    useAuthStore.setState({ status: 'signedIn', user: STORED });

    const { result } = await renderHookWithProviders(() => useProfileScreen());

    expect(result.current.user).toEqual(STORED);
    expect(result.current.fullName).toBe('Ada Lovelace');
  });

  test('prefers the fresh query result over the stored user', async () => {
    server.use(http.get('*/auth/me', () => HttpResponse.json(FRESH)));
    useAuthStore.setState({ status: 'signedIn', user: STORED });

    const { result } = await renderHookWithProviders(() => useProfileScreen());

    await waitFor(() => {
      expect(result.current.fullName).toBe('Grace Hopper');
    });
  });

  test('without any user the name is empty', async () => {
    server.use(http.get('*/auth/me', () => HttpResponse.json({ message: 'no' }, { status: 401 })));
    useAuthStore.setState({ status: 'signedOut', user: null });

    const { result } = await renderHookWithProviders(() => useProfileScreen());

    expect(result.current.user).toBeNull();
    expect(result.current.fullName).toBe('');
  });

  test('onEdit opens the EditProfile screen', async () => {
    const { result } = await renderHookWithProviders(() => useProfileScreen());

    result.current.onEdit();

    expect(mockNavigation.navigate).toHaveBeenCalledWith('EditProfile');
  });
});
