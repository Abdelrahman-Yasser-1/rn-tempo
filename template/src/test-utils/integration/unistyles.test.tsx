import { act, renderHook } from '@testing-library/react-native';
import { StyleSheet, UnistylesRuntime, useUnistyles } from 'react-native-unistyles';

import { darkTheme, lightTheme } from '@theme/index';
import { useAppTheme } from '@theme/useAppTheme';

// Smoke test for the real wiring of react-native-unistyles with the app themes, run through the
// official jest mock (the native runtime needs a device). It breaks when an upgrade changes the
// configure, hook or runtime API the app relies on.
describe('integration: react-native-unistyles', () => {
  test('the app themes are registered and resolved through useUnistyles', async () => {
    const { result } = await renderHook(() => useUnistyles());

    expect(result.current.theme.colors.primary).toBe(lightTheme.colors.primary);
    expect(lightTheme.colors.primary).not.toBe(darkTheme.colors.primary);
  });

  test('StyleSheet.create resolves theme functions against the registered theme', () => {
    const styles = StyleSheet.create((theme) => ({
      box: { backgroundColor: theme.colors.primary },
    }));

    expect(styles.box.backgroundColor).toBe(lightTheme.colors.primary);
  });

  test('switching the preference reaches the Unistyles runtime and the hook state', async () => {
    const setTheme = jest.spyOn(UnistylesRuntime, 'setTheme');
    const setAdaptiveThemes = jest.spyOn(UnistylesRuntime, 'setAdaptiveThemes');
    const { result } = await renderHook(() => useAppTheme());

    await act(() => {
      result.current.setPreference('dark');
    });

    expect(result.current.preference).toBe('dark');
    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(false);
    expect(setTheme).toHaveBeenLastCalledWith('dark');

    await act(() => {
      result.current.setPreference('system');
    });

    expect(result.current.preference).toBe('system');
    expect(setAdaptiveThemes).toHaveBeenLastCalledWith(true);
  });
});
