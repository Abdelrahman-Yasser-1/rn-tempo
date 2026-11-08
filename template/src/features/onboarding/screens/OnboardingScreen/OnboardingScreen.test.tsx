import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SLIDES } from '@features/onboarding/constants';
import { useShouldShowOnboarding } from '@features/onboarding/hooks/useShouldShowOnboarding';
import { useOnboardingStore } from '@features/onboarding/store/onboarding.store';
import { clearFlagOverrides } from '@services/flags/flagOverrides';
import { APP_CONFIG_QUERY_KEY } from '@services/remote-config/remoteConfig';
import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';
import { Text } from '@shared/components';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { OnboardingScreen } from './OnboardingScreen';

/** Stands in for the navigator gate: shows 'login' once onboarding no longer applies. */
function Gate() {
  const shouldShow = useShouldShowOnboarding();
  return <Text>{shouldShow ? 'onboarding' : 'login'}</Text>;
}

async function renderOnboarding() {
  const view = await renderWithProviders(
    <>
      <OnboardingScreen />
      <Gate />
    </>,
  );
  // The flag reads remote config; let that settle so its update lands inside the render.
  await waitFor(() => {
    expect(view.queryClient.getQueryState(APP_CONFIG_QUERY_KEY)?.status).toBe('success');
  });
  return view;
}

/**
 * Simulates the list reporting `index` as the visible slide (layout does not run under Jest).
 * The slide's title heading is the handle: fireEvent bubbles up to the FlatList's handler.
 */
async function showSlide(index: number) {
  const heading = screen.getAllByRole('header').at(index);
  if (heading === undefined) {
    throw new Error(`No slide heading at index ${String(index)}`);
  }
  await fireEvent(heading, 'viewableItemsChanged', {
    viewableItems: [{ index, item: SLIDES.at(index), key: SLIDES.at(index)?.id, isViewable: true }],
    changed: [],
  });
}

beforeEach(async () => {
  await initStorage();
  storage.clearAll();
  useOnboardingStore.setState({ isCompleted: undefined });
});

afterEach(() => {
  clearFlagOverrides();
});

describe('OnboardingScreen', () => {
  test('AC-2: Skip persists completion and hands over to Login', async () => {
    const { user } = await renderOnboarding();
    expect(screen.getByText('onboarding')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Skip' }));

    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBe(true);
    await waitFor(() => {
      expect(screen.getByText('login')).toBeOnTheScreen();
    });
  });

  test('AC-2: Get started on the last slide persists completion and hands over to Login', async () => {
    const { user } = await renderOnboarding();

    await showSlide(1);
    await showSlide(2);
    await user.press(screen.getByRole('button', { name: 'Get started' }));

    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBe(true);
    await waitFor(() => {
      expect(screen.getByText('login')).toBeOnTheScreen();
    });
  });

  test('Next is offered until the last slide, which switches the label to Get started', async () => {
    await renderOnboarding();

    expect(screen.getByRole('button', { name: 'Next' })).toBeOnTheScreen();

    await showSlide(1);
    expect(screen.getByRole('button', { name: 'Next' })).toBeOnTheScreen();

    await showSlide(2);
    expect(screen.getByRole('button', { name: 'Get started' })).toBeOnTheScreen();
  });

  test('the page indicator marks the visible slide as selected', async () => {
    await renderOnboarding();

    expect(screen.getByLabelText('Page 1 of 3')).toHaveProp('accessibilityState', {
      selected: true,
    });

    await showSlide(1);

    expect(screen.getByLabelText('Page 2 of 3')).toHaveProp('accessibilityState', {
      selected: true,
    });
    expect(screen.getByLabelText('Page 1 of 3')).toHaveProp('accessibilityState', {
      selected: false,
    });
  });

  test('Next moves to the following slide without completing onboarding', async () => {
    const { user } = await renderOnboarding();

    await user.press(screen.getByRole('button', { name: 'Next' }));

    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBeUndefined();
    expect(screen.getByText('onboarding')).toBeOnTheScreen();
  });
});
