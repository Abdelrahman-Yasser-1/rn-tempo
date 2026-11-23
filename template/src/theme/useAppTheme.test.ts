import { act, renderHook } from '@testing-library/react-native';
import { Appearance } from 'react-native';
import { UnistylesRuntime } from 'react-native-unistyles';

import { configureThemePersistence, initTheme, useAppTheme } from './useAppTheme';

let storedMode: string | undefined;
let storedPalette: string | undefined;
const saveMode = jest.fn((mode: string) => {
  storedMode = mode;
});
const savePalette = jest.fn((palette: string) => {
  storedPalette = palette;
});

const setAdaptiveThemes = jest.spyOn(UnistylesRuntime, 'setAdaptiveThemes');
const setTheme = jest.spyOn(UnistylesRuntime, 'setTheme');
const getColorScheme = jest.spyOn(Appearance, 'getColorScheme');
const addChangeListener = jest.spyOn(Appearance, 'addChangeListener');

beforeEach(() => {
  storedMode = undefined;
  storedPalette = undefined;
  jest.clearAllMocks();
  getColorScheme.mockReturnValue('light');
  configureThemePersistence({
    loadMode: () => storedMode,
    loadPalette: () => storedPalette,
    saveMode,
    savePalette,
  });
});

describe('useAppTheme', () => {
  test('AC-2: defaults to system mode and the default palette with adaptive themes on', () => {
    initTheme();

    expect(setAdaptiveThemes).toHaveBeenCalledWith(true);
    expect(setTheme).not.toHaveBeenCalled();
  });

  test('AC-2: restores a stored explicit mode at init', () => {
    storedMode = 'dark';

    initTheme();

    expect(setAdaptiveThemes).toHaveBeenCalledWith(false);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  test('AC-2: restores a stored palette together with the mode', () => {
    storedMode = 'dark';
    storedPalette = 'forest';

    initTheme();

    expect(setTheme).toHaveBeenLastCalledWith('forestDark');
  });

  test('migration: a value stored by the old preference stays valid as the mode', async () => {
    for (const old of ['light', 'dark', 'system'] as const) {
      storedMode = old;
      storedPalette = undefined;

      initTheme();

      const state = await readState();
      expect(state.mode).toBe(old);
      expect(state.palette).toBe('default');
    }
  });

  test('AC-2: ignores invalid stored values', async () => {
    storedMode = 'sepia';
    storedPalette = 'neon';

    initTheme();

    expect(setAdaptiveThemes).toHaveBeenCalledWith(true);
    expect(await readState()).toMatchObject({ mode: 'system', palette: 'default' });
  });

  test('AC-2: switching mode at runtime updates the hook without remounting and persists', async () => {
    initTheme();
    const { result } = await renderHook(() => useAppTheme());
    expect(result.current.mode).toBe('system');
    expect(result.current.theme.colors.primary).toBeDefined();

    await act(() => {
      result.current.setMode('dark');
    });

    expect(result.current.mode).toBe('dark');
    expect(saveMode).toHaveBeenLastCalledWith('dark');
    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(false);
    expect(setTheme).toHaveBeenLastCalledWith('dark');

    await act(() => {
      result.current.setMode('system');
    });

    expect(result.current.mode).toBe('system');
    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(true);
  });

  test('AC-2: switching palette keeps the mode and persists the palette', async () => {
    storedMode = 'dark';
    initTheme();
    const { result } = await renderHook(() => useAppTheme());

    await act(() => {
      result.current.setPalette('ocean');
    });

    expect(result.current.palette).toBe('ocean');
    expect(result.current.mode).toBe('dark');
    expect(savePalette).toHaveBeenLastCalledWith('ocean');
    expect(saveMode).not.toHaveBeenCalled();
    expect(setTheme).toHaveBeenLastCalledWith('oceanDark');
  });

  test('a brand palette in system mode follows the device scheme, including later changes', async () => {
    getColorScheme.mockReturnValue('dark');
    const remove = jest.fn();
    let onChange: Parameters<typeof Appearance.addChangeListener>[0] = () => {
      /* replaced when the listener registers */
    };
    addChangeListener.mockImplementation((listener) => {
      onChange = listener;
      return { remove };
    });
    initTheme();
    const { result } = await renderHook(() => useAppTheme());

    await act(() => {
      result.current.setPalette('sunset');
    });

    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(false);
    expect(setTheme).toHaveBeenLastCalledWith('sunsetDark');

    onChange({ colorScheme: 'light' });

    expect(setTheme).toHaveBeenLastCalledWith('sunsetLight');

    await act(() => {
      result.current.setMode('light');
    });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenLastCalledWith('sunsetLight');
  });

  test('going back to the default palette in system mode re-enables adaptive themes', async () => {
    initTheme();
    const { result } = await renderHook(() => useAppTheme());
    await act(() => {
      result.current.setPalette('forest');
    });

    await act(() => {
      result.current.setPalette('default');
    });

    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(true);
  });
});

/** Current choices as the hook would report them, without a render. */
async function readState() {
  const { result } = await renderHook(() => useAppTheme());
  return result.current;
}
