import { renderHook, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { UnistylesRuntime } from 'react-native-unistyles';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { configureThemePersistence, initTheme, useAppTheme } from '@theme/index';

import { ThemeScreen } from './ThemeScreen';

type ThemeProps = ComponentProps<typeof ThemeScreen>;

function makeNavigation() {
  return { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

async function renderTheme(navigation = makeNavigation()) {
  const props = { navigation, route: { key: 'Theme', name: 'Theme' } } as unknown as ThemeProps;
  return renderWithProviders(<ThemeScreen {...props} />);
}

/** The stored preference as any other screen would read it through the hook. */
async function currentPreference() {
  const { result } = await renderHook(() => useAppTheme());
  return result.current.preference;
}

let stored: string | undefined;
const save = jest.fn((preference: string) => {
  stored = preference;
});

describe('ThemeScreen', () => {
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

  test('AC-3: picking Dark applies and persists the dark preference immediately', async () => {
    const { user } = await renderTheme();

    await user.press(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await currentPreference()).toBe('dark');
    expect(save).toHaveBeenLastCalledWith('dark');
    expect(setThemeSpy).toHaveBeenLastCalledWith('dark');
  });

  test('AC-3: picking Light applies and persists the light preference immediately', async () => {
    const { user } = await renderTheme();

    await user.press(screen.getByRole('radio', { name: 'Light' }));

    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(await currentPreference()).toBe('light');
    expect(save).toHaveBeenLastCalledWith('light');
  });

  test('AC-3: picking System follows the device theme and persists it', async () => {
    const { user } = await renderTheme();
    await user.press(screen.getByRole('radio', { name: 'Dark' }));

    await user.press(screen.getByRole('radio', { name: 'System' }));

    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(await currentPreference()).toBe('system');
    expect(save).toHaveBeenLastCalledWith('system');
    expect(setAdaptiveSpy).toHaveBeenLastCalledWith(true);
  });

  test('the current preference is the one selected when the screen opens', async () => {
    stored = 'light';
    initTheme();

    await renderTheme();

    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).not.toBeChecked();
  });
});
