import { act, renderHook } from '@testing-library/react-native';
import { UnistylesRuntime } from 'react-native-unistyles';

import { configureThemePersistence, initTheme, useAppTheme } from './useAppTheme';

let stored: string | undefined;
const save = jest.fn((preference: string) => {
  stored = preference;
});

const setAdaptiveThemes = jest.spyOn(UnistylesRuntime, 'setAdaptiveThemes');
const setTheme = jest.spyOn(UnistylesRuntime, 'setTheme');

beforeEach(() => {
  stored = undefined;
  jest.clearAllMocks();
  configureThemePersistence({ load: () => stored, save });
});

describe('useAppTheme', () => {
  test('AC-2: defaults to system preference with adaptive themes on', () => {
    initTheme();

    expect(setAdaptiveThemes).toHaveBeenCalledWith(true);
    expect(setTheme).not.toHaveBeenCalled();
  });

  test('AC-2: restores a stored explicit preference at init', () => {
    stored = 'dark';

    initTheme();

    expect(setAdaptiveThemes).toHaveBeenCalledWith(false);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  test('AC-2: ignores an invalid stored value', () => {
    stored = 'sepia';

    initTheme();

    expect(setAdaptiveThemes).toHaveBeenCalledWith(true);
  });

  test('AC-2: switching preference at runtime updates the hook without remounting and persists', async () => {
    initTheme();
    const { result } = await renderHook(() => useAppTheme());
    expect(result.current.preference).toBe('system');
    expect(result.current.theme.colors.primary).toBeDefined();

    await act(() => {
      result.current.setPreference('dark');
    });

    expect(result.current.preference).toBe('dark');
    expect(save).toHaveBeenLastCalledWith('dark');
    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(false);
    expect(setTheme).toHaveBeenLastCalledWith('dark');

    await act(() => {
      result.current.setPreference('system');
    });

    expect(result.current.preference).toBe('system');
    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(true);
  });
});
