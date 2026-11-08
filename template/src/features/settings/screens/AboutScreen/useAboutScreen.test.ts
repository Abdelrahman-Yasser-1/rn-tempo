import { act } from '@testing-library/react-native';

import { SECRET_TAP_COUNT, SECRET_TAP_WINDOW_MS } from '@features/settings/constants';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useAboutScreen } from './useAboutScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
});

const mockRootNavigate = jest.fn<undefined, [string]>();
const mockRoot = { isReady: true };
jest.mock('@navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => mockRoot.isReady,
    navigate: (name: string) => {
      mockRootNavigate(name);
    },
  },
}));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  mockRootNavigate.mockClear();
  mockRoot.isReady = true;
});

afterEach(() => {
  jest.useRealTimers();
});

/** Presses the version row `count` times, `gapMs` apart. */
async function tapVersion(
  result: { current: ReturnType<typeof useAboutScreen> },
  count: number,
  gapMs: number,
) {
  for (let index = 0; index < count; index += 1) {
    await act(() => {
      result.current.onVersionPress();
      jest.advanceTimersByTime(gapMs);
      return Promise.resolve();
    });
  }
}

describe('useAboutScreen', () => {
  test('enough quick taps open the debug menu', async () => {
    const { result } = await renderHookWithProviders(() => useAboutScreen());

    await tapVersion(result, SECRET_TAP_COUNT, 500);

    expect(mockRootNavigate).toHaveBeenCalledTimes(1);
    expect(mockRootNavigate).toHaveBeenCalledWith('DebugMenu');
  });

  test('one tap too few does not open the debug menu', async () => {
    const { result } = await renderHookWithProviders(() => useAboutScreen());

    await tapVersion(result, SECRET_TAP_COUNT - 1, 500);

    expect(mockRootNavigate).not.toHaveBeenCalled();
  });

  test('slow taps outside the window do not open the debug menu', async () => {
    const { result } = await renderHookWithProviders(() => useAboutScreen());

    await tapVersion(result, SECRET_TAP_COUNT, SECRET_TAP_WINDOW_MS / 2 + 100);

    expect(mockRootNavigate).not.toHaveBeenCalled();
  });

  test('the debug menu stays closed while the root navigator is not ready', async () => {
    mockRoot.isReady = false;
    const { result } = await renderHookWithProviders(() => useAboutScreen());

    await tapVersion(result, SECRET_TAP_COUNT, 100);

    expect(mockRootNavigate).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useAboutScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
