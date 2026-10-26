import { useAuthStatus } from '@features/auth';

/** Gate for the protected navigator groups (`if:` in the static config). */
export function useIsSignedIn(): boolean {
  return useAuthStatus() === 'signedIn';
}

/** Gate for the auth navigator group; false while status is still `unknown`. */
export function useIsSignedOut(): boolean {
  return useAuthStatus() === 'signedOut';
}
