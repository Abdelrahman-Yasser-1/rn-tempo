import { act } from '@testing-library/react-native';
import type { FlatList } from 'react-native';

import { SLIDES } from '@features/onboarding/constants';
import { useOnboardingStore } from '@features/onboarding/store/onboarding.store';
import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useOnboardingScreen } from './useOnboardingScreen';

const LAST_INDEX = SLIDES.length - 1;

type ViewableInfo = Parameters<ReturnType<typeof useOnboardingScreen>['onViewableChange']>[0];

/** Shapes a viewability callback payload that reports `index` as the first visible slide. */
const viewable = (index: number | null) =>
  ({ viewableItems: [{ index }], changed: [] }) as unknown as ViewableInfo;

beforeEach(async () => {
  await initStorage();
  storage.remove(STORAGE_KEYS.onboardingCompleted);
  useOnboardingStore.setState({ isCompleted: undefined });
});

describe('useOnboardingScreen', () => {
  test('starts on the first slide, which is not the last', async () => {
    const { result } = await renderHookWithProviders(() => useOnboardingScreen());

    expect(result.current.activeIndex).toBe(0);
    expect(result.current.isLast).toBe(false);
  });

  test('viewability changes move the active slide and flag the last one', async () => {
    const { result } = await renderHookWithProviders(() => useOnboardingScreen());

    await act(() => {
      result.current.onViewableChange(viewable(LAST_INDEX));
      return Promise.resolve();
    });

    expect(result.current.activeIndex).toBe(LAST_INDEX);
    expect(result.current.isLast).toBe(true);
  });

  test('a viewability payload without an index keeps the active slide', async () => {
    const { result } = await renderHookWithProviders(() => useOnboardingScreen());

    await act(() => {
      result.current.onViewableChange({ viewableItems: [], changed: [] });
      result.current.onViewableChange(viewable(null));
      return Promise.resolve();
    });

    expect(result.current.activeIndex).toBe(0);
  });

  test('next scrolls to the following slide while slides remain', async () => {
    const { result } = await renderHookWithProviders(() => useOnboardingScreen());
    const scrollToIndex = jest.fn();
    result.current.listRef.current = { scrollToIndex } as unknown as FlatList;

    result.current.onNext();

    expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, animated: true });
    expect(useOnboardingStore.getState().isCompleted).toBeUndefined();
  });

  test('next on the last slide completes onboarding', async () => {
    const { result } = await renderHookWithProviders(() => useOnboardingScreen());
    await act(() => {
      result.current.onViewableChange(viewable(LAST_INDEX));
      return Promise.resolve();
    });

    await act(() => {
      result.current.onNext();
      return Promise.resolve();
    });

    expect(useOnboardingStore.getState().isCompleted).toBe(true);
    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBe(true);
  });

  test('skip completes onboarding from any slide', async () => {
    const { result } = await renderHookWithProviders(() => useOnboardingScreen());

    await act(() => {
      result.current.onSkip();
      return Promise.resolve();
    });

    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });
});
