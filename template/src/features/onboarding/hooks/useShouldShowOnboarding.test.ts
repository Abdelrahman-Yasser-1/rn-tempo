import { screen } from '@testing-library/react-native';
import { createElement } from 'react';

import { useOnboardingStore } from '@features/onboarding/store/onboarding.store';
import { clearFlagOverrides, setFlagOverride } from '@services/flags/flagOverrides';
import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';
import { Text } from '@shared/components';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { useShouldShowOnboarding } from './useShouldShowOnboarding';

/** Renders 'show' or 'hide' so each test can assert on the hook's answer. */
function Probe() {
  const shouldShow = useShouldShowOnboarding();
  return createElement(Text, null, shouldShow ? 'show' : 'hide');
}

beforeEach(async () => {
  await initStorage();
  storage.clearAll();
  useOnboardingStore.setState({ isCompleted: undefined });
});

afterEach(() => {
  clearFlagOverrides();
});

describe('useShouldShowOnboarding', () => {
  test('AC-1: shows onboarding when it is enabled and not completed', async () => {
    await renderWithProviders(createElement(Probe));

    expect(screen.getByText('show')).toBeOnTheScreen();
  });

  test('AC-3: hides onboarding once it was completed in this session', async () => {
    useOnboardingStore.setState({ isCompleted: true });

    await renderWithProviders(createElement(Probe));

    expect(screen.getByText('hide')).toBeOnTheScreen();
  });

  test('AC-3: hides onboarding when completion was persisted by an earlier launch', async () => {
    storage.setBoolean(STORAGE_KEYS.onboardingCompleted, true);

    await renderWithProviders(createElement(Probe));

    expect(screen.getByText('hide')).toBeOnTheScreen();
  });

  test('AC-3: hides onboarding when the onboardingEnabled flag is off', async () => {
    setFlagOverride('onboardingEnabled', false);

    await renderWithProviders(createElement(Probe));

    expect(screen.getByText('hide')).toBeOnTheScreen();
  });
});
