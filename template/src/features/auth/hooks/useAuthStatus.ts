import { useAuthStore } from '@features/auth/store/auth.store';

/** Current auth status; re-renders only when it changes. */
export function useAuthStatus() {
  return useAuthStore((state) => state.status);
}
