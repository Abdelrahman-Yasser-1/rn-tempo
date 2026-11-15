import { useAuthStore } from '@features/auth';
import { initDraftCleanup } from '@shared/components/DynamicForm';

type AuthState = ReturnType<typeof useAuthStore.getState>;

const userIdOf = (state: AuthState): string | null => (state.user ? String(state.user.id) : null);

/**
 * Connects the form drafts to the auth store: a draft belongs to the signed-in user, and sign-out
 * or a change of user deletes all of them. Call once at app start; returns the unsubscribe function.
 */
export function initFormDrafts(): () => void {
  return initDraftCleanup({
    getOwner: () => {
      const state = useAuthStore.getState();
      return state.status === 'signedIn' ? userIdOf(state) : null;
    },
    subscribe: (listener) =>
      useAuthStore.subscribe((state, previous) => {
        listener(userIdOf(state), userIdOf(previous));
      }),
  });
}
