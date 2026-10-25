import { useAuthStore } from '../store/auth.store';

/** The signed-in user, or `null`. */
export function useCurrentUser() {
  return useAuthStore((state) => state.user);
}
