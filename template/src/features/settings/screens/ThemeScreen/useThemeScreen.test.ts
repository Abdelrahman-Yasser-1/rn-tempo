import { act } from '@testing-library/react-native';
import { UnistylesRuntime } from 'react-native-unistyles';

import { renderHookWithProviders } from '@test-utils/renderWithProviders';
import { configureThemePersistence, initTheme } from '@theme/index';

import { useThemeScreen } from './useThemeScreen';

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

let stored: string | undefined;
const save = jest.fn((preference: string) => {
  stored = preference;
});

describe('useThemeScreen', () => {
  let setThemeSpy: jest.SpyInstance;
  let setAdaptiveSpy: jest.SpyInstance;

  beforeEach(() => {
    stored = undefined;
    jest.clearAllMocks();
    setThemeSpy = jest.spyOn(UnistylesRuntime, 'setTheme');
    setAdaptiveSpy = jest.spyOn(UnistylesRuntime, 'setAdaptiveThemes');
    configureThemePersistence({ load: () => stored, save });
    // Back to the default (system) preference so each test starts from the same state.
    initTheme();
  });

  afterEach(() => {
    setThemeSpy.mockRestore();
    setAdaptiveSpy.mockRestore();
  });

  test('starts with the system preference', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    expect(result.current.preference).toBe('system');
  });

  test('a valid choice applies and persists the preference', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    await act(() => {
      result.current.onChange('dark');
      return Promise.resolve();
    });

    expect(result.current.preference).toBe('dark');
    expect(save).toHaveBeenCalledWith('dark');
  });

  test('an unknown value is ignored', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    await act(() => {
      result.current.onChange('sepia');
      return Promise.resolve();
    });

    expect(result.current.preference).toBe('system');
    expect(save).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
