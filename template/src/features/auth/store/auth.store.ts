import { create } from 'zustand';

import { queryClient } from '@services/http/queryClient';
import { tokenStore, type AuthTokens } from '@services/secure-storage/tokenStore';

import type { User } from '../types';

export type AuthStatus = 'unknown' | 'signedIn' | 'signedOut';

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  /** Deep link opened while signed out; resumed after login (contract C12). */
  pendingLink: string | null;
  signIn: (tokens: AuthTokens, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  setPendingLink: (link: string | null) => void;
};

// Deliberately not persisted: status is derived at bootstrap from the keychain token + /auth/me,
// and tokens live only in the token store (never in Zustand or MMKV).
export const useAuthStore = create<AuthState>()((set) => ({
  status: 'unknown',
  user: null,
  pendingLink: null,

  signIn: async (tokens, user) => {
    await tokenStore.setTokens(tokens);
    set({ status: 'signedIn', user });
  },

  signOut: async () => {
    // State first so navigation leaves protected screens immediately, then wipe secrets and caches.
    set({ status: 'signedOut', user: null, pendingLink: null });
    queryClient.clear();
    await tokenStore.clear();
  },

  setUser: (user) => {
    set({ user });
  },

  setPendingLink: (link) => {
    set({ pendingLink: link });
  },
}));
