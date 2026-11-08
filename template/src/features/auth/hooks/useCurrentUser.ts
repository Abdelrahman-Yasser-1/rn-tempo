import { useAuthStore } from '@features/auth/store/auth.store';

/** The signed-in user, or `null`. */
export function useCurrentUser() {
  return useAuthStore((state) => state.user);
}
