import { act, renderHook, waitFor } from '@testing-library/react-native';

import { queryClient } from '@services/http/queryClient';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { createUser } from '@test-utils/factories/user';

import { authKeys } from '../api/keys';
import { useAuthStore } from '../store/auth.store';

import { useLogout } from './useLogout';

const user = createUser({ firstName: 'Emily' });
const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

beforeEach(async () => {
  await tokenStore.clear();
  queryClient.clear();
  useAuthStore.setState({ status: 'signedIn', user, pendingLink: null });
  await useAuthStore.getState().signIn(tokens, user);
});

afterEach(() => {
  queryClient.clear();
});

describe('useLogout', () => {
  test('AC-5: logging out clears the tokens and the query cache and signs the user out', async () => {
    queryClient.setQueryData(authKeys.me(), user);
    const { result } = await renderHook(() => useLogout());

    await act(async () => {
      await result.current();
    });

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signedOut');
    });
    expect(tokenStore.hasTokens()).toBe(false);
    expect(queryClient.getQueryData(authKeys.me())).toBeUndefined();
    expect(useAuthStore.getState().user).toBeNull();
  });

  test('returns a stable function across re-renders', async () => {
    const { result, rerender } = await renderHook(() => useLogout());
    const first = result.current;

    await rerender(undefined);

    expect(result.current).toBe(first);
  });
});
