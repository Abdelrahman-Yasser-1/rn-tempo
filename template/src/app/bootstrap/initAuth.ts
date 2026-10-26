import { useAuthStore, UserSchema } from '@features/auth';
import { normalizeError } from '@services/http/errors';
import { request } from '@services/http/request';
import { logger } from '@services/logger/logger';
import { tokenStore } from '@services/secure-storage/tokenStore';

/**
 * Bootstrap steps 4-5: hydrate tokens from the keychain, then derive the session. With a token we
 * confirm it via `/auth/me`; without one (or when the server rejects it) the user is signed out.
 * A transient failure (offline, timeout, 5xx) keeps the tokens and enters the app signed in with
 * no user yet, so being offline at launch does not log anyone out; screens refetch the user.
 */
export async function initAuth(): Promise<void> {
  const { signIn, signOut } = useAuthStore.getState();
  try {
    await tokenStore.hydrate();
  } catch (error) {
    logger.warn('Could not read tokens from the keychain', error);
  }

  const accessToken = tokenStore.getAccessToken();
  const refreshToken = tokenStore.getRefreshToken();
  if (accessToken === null || refreshToken === null) {
    await signOut();
    return;
  }

  try {
    const user = await request({ url: '/auth/me' }, UserSchema);
    // Tokens may have been refreshed during the call; read them again.
    await signIn(
      {
        accessToken: tokenStore.getAccessToken() ?? accessToken,
        refreshToken: tokenStore.getRefreshToken() ?? refreshToken,
      },
      user,
    );
  } catch (error) {
    const { code } = normalizeError(error);
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
      await signOut();
      return;
    }
    logger.warn('Session check failed, continuing with stored tokens', error);
    useAuthStore.setState({ status: 'signedIn', user: null });
  }
}
