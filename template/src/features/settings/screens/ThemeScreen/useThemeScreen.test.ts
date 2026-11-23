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
let storedPalette: string | undefined;
let storedScale: string | undefined;
const save = jest.fn((mode: string) => {
  stored = mode;
});
const savePalette = jest.fn((palette: string) => {
  storedPalette = palette;
});

describe('useThemeScreen', () => {
  let setThemeSpy: jest.SpyInstance;
  let setAdaptiveSpy: jest.SpyInstance;

  beforeEach(() => {
    stored = undefined;
    storedPalette = undefined;
    jest.clearAllMocks();
    setThemeSpy = jest.spyOn(UnistylesRuntime, 'setTheme');
    setAdaptiveSpy = jest.spyOn(UnistylesRuntime, 'setAdaptiveThemes');
    configureThemePersistence({
      loadMode: () => stored,
      loadPalette: () => storedPalette,
      saveMode: save,
      savePalette,
      loadFontScale: () => storedScale,
      saveFontScale: jest.fn(),
    });
    // Back to the default (system) preference so each test starts from the same state.
    initTheme();
  });

  afterEach(() => {
    setThemeSpy.mockRestore();
    setAdaptiveSpy.mockRestore();
  });

  test('starts with the system preference', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    expect(result.current.mode).toBe('system');
  });

  test('a valid choice applies and persists the preference', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    await act(() => {
      result.current.onChange('dark');
      return Promise.resolve();
    });

    expect(result.current.mode).toBe('dark');
    expect(save).toHaveBeenCalledWith('dark');
  });

  test('an unknown value is ignored', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    await act(() => {
      result.current.onChange('sepia');
      return Promise.resolve();
    });

    expect(result.current.mode).toBe('system');
    expect(save).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('a valid palette applies and persists, an unknown one is ignored', async () => {
    const { result } = await renderHookWithProviders(() => useThemeScreen());

    await act(() => {
      result.current.onPaletteChange('forest');
      result.current.onPaletteChange('neon');
      return Promise.resolve();
    });

    expect(result.current.palette).toBe('forest');
    expect(savePalette).toHaveBeenCalledTimes(1);
    expect(savePalette).toHaveBeenCalledWith('forest');
  });
});
