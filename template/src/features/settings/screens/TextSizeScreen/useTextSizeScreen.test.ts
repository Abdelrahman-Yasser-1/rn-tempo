import { act } from '@testing-library/react-native';

import { renderHookWithProviders } from '@test-utils/renderWithProviders';
import { configureThemePersistence, initTheme } from '@theme/index';

import { useTextSizeScreen } from './useTextSizeScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

let storedScale: string | undefined;
const saveFontScale = jest.fn((scale: number) => {
  storedScale = String(scale);
});

beforeEach(() => {
  jest.clearAllMocks();
  storedScale = undefined;
  configureThemePersistence({
    loadMode: () => storedScale,
    loadPalette: () => storedScale,
    saveMode: jest.fn(),
    savePalette: jest.fn(),
    loadFontScale: () => storedScale,
    saveFontScale,
  });
  initTheme();
});

describe('useTextSizeScreen', () => {
  test('starts at the default scale', async () => {
    const { result } = await renderHookWithProviders(() => useTextSizeScreen());

    expect(result.current.value).toBe('1');
  });

  test('AC-F-1: a known scale applies and persists, an unknown one is ignored', async () => {
    const { result } = await renderHookWithProviders(() => useTextSizeScreen());

    await act(() => {
      result.current.onChange('1.3');
      result.current.onChange('2');
      result.current.onChange('huge');
      return Promise.resolve();
    });

    expect(result.current.value).toBe('1.3');
    expect(saveFontScale).toHaveBeenCalledTimes(1);
    expect(saveFontScale).toHaveBeenCalledWith(1.3);
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useTextSizeScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
