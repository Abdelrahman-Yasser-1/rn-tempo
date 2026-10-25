import { act, renderHook } from '@testing-library/react-native';

import { useAuthStore } from '../store/auth.store';
import { UserSchema } from '../types';

import { useAuthStatus } from './useAuthStatus';
import { useCurrentUser } from './useCurrentUser';

describe('auth hooks', () => {
  test('useAuthStatus and useCurrentUser follow the store', async () => {
    useAuthStore.setState({ status: 'unknown', user: null });
    const { result } = await renderHook(() => ({
      status: useAuthStatus(),
      user: useCurrentUser(),
    }));
    expect(result.current).toEqual({ status: 'unknown', user: null });

    const user = UserSchema.parse({
      id: 2,
      username: 'u',
      email: 'e',
      firstName: 'f',
      lastName: 'l',
      gender: 'g',
      image: 'i',
    });
    await act(() => {
      useAuthStore.setState({ status: 'signedIn', user });
    });

    expect(result.current).toEqual({ status: 'signedIn', user });
  });
});
