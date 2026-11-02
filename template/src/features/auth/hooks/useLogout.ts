import { useCallback } from 'react';

import { useAuthStore } from '../store/auth.store';

/** Signs out: clears tokens and the query cache; the navigator then shows Login. */
export function useLogout() {
  return useCallback(() => useAuthStore.getState().signOut(), []);
}
