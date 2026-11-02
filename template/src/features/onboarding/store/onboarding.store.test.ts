import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';

import { useOnboardingStore } from './onboarding.store';

beforeEach(async () => {
  await initStorage();
  storage.clearAll();
  useOnboardingStore.setState({ isCompleted: undefined });
});

describe('onboarding store', () => {
  test('starts with completion unknown so the stored value decides', () => {
    expect(useOnboardingStore.getState().isCompleted).toBeUndefined();
    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBeUndefined();
  });

  test('AC-2: complete persists the flag and flips the in-memory state', () => {
    useOnboardingStore.getState().complete();

    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBe(true);
    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });

  test('complete is safe to call more than once', () => {
    useOnboardingStore.getState().complete();
    useOnboardingStore.getState().complete();

    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBe(true);
    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });
});
