import { useOnboardingStore } from '@features/onboarding/store/onboarding.store';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

/** Navigator gate: true while onboarding is enabled and the user has not completed it. */
export function useShouldShowOnboarding(): boolean {
  const isEnabled = useFeatureFlag('onboardingEnabled');
  const isCompletedInMemory = useOnboardingStore((state) => state.isCompleted);
  const isCompleted =
    isCompletedInMemory ?? storage.getBoolean(STORAGE_KEYS.onboardingCompleted) === true;
  return isEnabled && !isCompleted;
}
