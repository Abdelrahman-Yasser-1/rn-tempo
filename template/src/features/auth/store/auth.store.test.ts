import { queryClient } from '@services/http/queryClient';
import { tokenStore } from '@services/secure-storage/tokenStore';

import { UserSchema, type User } from '../types';

import { useAuthStore } from './auth.store';

const user: User = UserSchema.parse({
  id: 1,
  username: 'emilys',
  email: 'emily@example.test',
  firstName: 'Emily',
  lastName: 'Johnson',
  gender: 'female',
  image: 'https://example.test/emily.png',
});
const tokens = { accessToken: 'a', refreshToken: 'r' };

beforeEach(async () => {
  await tokenStore.clear();
  queryClient.clear();
  useAuthStore.setState({ status: 'unknown', user: null, pendingLink: null });
});

describe('auth store', () => {
  test('AC-5: starts unknown with no user', () => {
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unknown',
      user: null,
      pendingLink: null,
    });
  });

  test('AC-5: signIn stores tokens and moves to signedIn', async () => {
    await useAuthStore.getState().signIn(tokens, user);

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', user });
    expect(tokenStore.getAccessToken()).toBe('a');
  });

  test('AC-5: signOut clears tokens, the query cache, the user and the pending link', async () => {
    await useAuthStore.getState().signIn(tokens, user);
    useAuthStore.getState().setPendingLink('tempo-dev://settings');
    queryClient.setQueryData(['me'], user);

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState()).toMatchObject({
      status: 'signedOut',
      user: null,
      pendingLink: null,
    });
    expect(tokenStore.hasTokens()).toBe(false);
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
  });

  test('AC-5: signOut works from the unknown state (bootstrap without a token)', async () => {
    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  test('AC-5: setUser and setPendingLink update only their field', () => {
    useAuthStore.getState().setUser(user);
    useAuthStore.getState().setPendingLink('tempo-dev://items/1');

    expect(useAuthStore.getState()).toMatchObject({
      status: 'unknown',
      user,
      pendingLink: 'tempo-dev://items/1',
    });
    useAuthStore.getState().setPendingLink(null);
    expect(useAuthStore.getState().pendingLink).toBeNull();
  });

  test('AC-5: the store holds no tokens', async () => {
    await useAuthStore.getState().signIn(tokens, user);

    expect(JSON.stringify(useAuthStore.getState())).not.toContain('"a"');
    expect(Object.keys(useAuthStore.getState())).not.toContain('accessToken');
  });
});
