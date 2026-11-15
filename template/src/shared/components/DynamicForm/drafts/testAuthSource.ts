import { initDraftCleanup } from '@shared/components/DynamicForm/drafts/drafts';
import type { DraftAuthSource } from '@shared/components/DynamicForm/drafts/drafts';

type UserListener = (userId: string | null, previousUserId: string | null) => void;

/**
 * A stand-in for the app's auth store, for tests of code that saves form drafts: the drafts only
 * need the signed-in user id and its changes. `connect()` wires it as the app does in `App.tsx`
 * and returns the stop function.
 */
export function createDraftAuth() {
  let userId: string | null = null;
  const listeners = new Set<UserListener>();

  const source: DraftAuthSource = {
    getOwner: () => userId,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const setUser = (next: string | null) => {
    const previous = userId;
    userId = next;
    for (const listener of listeners) {
      listener(next, previous);
    }
  };

  return {
    source,
    connect: () => initDraftCleanup(source),
    signIn: (id: number) => {
      setUser(String(id));
    },
    signOut: () => {
      setUser(null);
    },
  };
}
