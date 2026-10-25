import * as Keychain from 'react-native-keychain';

import { KEYCHAIN_SERVICES } from '@services/storage/keys';

import { tokenStore } from './tokenStore';

const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1' };

beforeEach(async () => {
  await tokenStore.clear();
  jest.clearAllMocks();
});

describe('tokenStore', () => {
  test('AC-5: hydrate with an empty keychain yields no tokens', async () => {
    await expect(tokenStore.hydrate()).resolves.toBeNull();

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.hasTokens()).toBe(false);
  });

  test('AC-5: setTokens updates memory synchronously and persists to the keychain service', async () => {
    const pending = tokenStore.setTokens(tokens);

    expect(tokenStore.getAccessToken()).toBe('access-1');
    expect(tokenStore.getRefreshToken()).toBe('refresh-1');
    await pending;
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'auth-tokens',
      JSON.stringify(tokens),
      expect.objectContaining({
        service: KEYCHAIN_SERVICES.authTokens,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  });

  test('AC-5: hydrate restores tokens that only exist in the keychain (cold start)', async () => {
    await Keychain.setGenericPassword('auth-tokens', JSON.stringify(tokens), {
      service: KEYCHAIN_SERVICES.authTokens,
    });
    expect(tokenStore.hasTokens()).toBe(false);

    await expect(tokenStore.hydrate()).resolves.toEqual(tokens);

    expect(tokenStore.getAccessToken()).toBe('access-1');
  });

  test('AC-5: clear empties memory and removes the keychain entry', async () => {
    await tokenStore.setTokens(tokens);

    await tokenStore.clear();

    expect(tokenStore.hasTokens()).toBe(false);
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: KEYCHAIN_SERVICES.authTokens,
    });
    await expect(tokenStore.hydrate()).resolves.toBeNull();
  });

  test('AC-5: corrupt keychain content hydrates to null', async () => {
    await Keychain.setGenericPassword('auth-tokens', '{broken', {
      service: KEYCHAIN_SERVICES.authTokens,
    });

    await expect(tokenStore.hydrate()).resolves.toBeNull();
  });

  test('AC-5: structurally invalid content hydrates to null', async () => {
    await Keychain.setGenericPassword('auth-tokens', JSON.stringify({ accessToken: 'x' }), {
      service: KEYCHAIN_SERVICES.authTokens,
    });

    await expect(tokenStore.hydrate()).resolves.toBeNull();
  });
});
