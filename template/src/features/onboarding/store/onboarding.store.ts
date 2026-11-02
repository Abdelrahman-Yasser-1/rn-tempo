import { create } from 'zustand';

import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

export type OnboardingState = {
  /** `undefined` until completion happens in this session: storage is not ready at import time. */
  isCompleted: boolean | undefined;
  /** Persists completion, then flips the in-memory flag so the navigator re-evaluates. */
  complete: () => void;
};

export const useOnboardingStore = create<OnboardingState>()((set) => ({
  isCompleted: undefined,
  complete: () => {
    storage.setBoolean(STORAGE_KEYS.onboardingCompleted, true);
    set({ isCompleted: true });
  },
}));
