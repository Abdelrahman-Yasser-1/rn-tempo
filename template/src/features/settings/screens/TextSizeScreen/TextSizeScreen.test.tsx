import { screen } from '@testing-library/react-native';
import { UnistylesRuntime } from 'react-native-unistyles';

import { renderWithProviders } from '@test-utils/renderWithProviders';
import { buildTypography, configureThemePersistence, initTheme } from '@theme/index';

import { TextSizeScreen } from './TextSizeScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

let storedScale: string | undefined;
let storedMode: string | undefined;
const saveFontScale = jest.fn((scale: number) => {
  storedScale = String(scale);
});

describe('TextSizeScreen', () => {
  let updateThemeSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    storedScale = undefined;
    updateThemeSpy = jest.spyOn(UnistylesRuntime, 'updateTheme');
    configureThemePersistence({
      loadMode: () => storedMode,
      loadPalette: () => storedMode,
      saveMode: jest.fn(),
      savePalette: jest.fn(),
      loadFontScale: () => storedScale,
      saveFontScale,
    });
    initTheme();
    updateThemeSpy.mockClear();
  });

  afterEach(() => {
    updateThemeSpy.mockRestore();
  });

  test('AC-F-4: lists the four sizes as radios with the default selected', async () => {
    await renderWithProviders(<TextSizeScreen />);

    for (const name of ['Small', 'Default', 'Large', 'Extra large']) {
      expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Large' })).not.toBeChecked();
  });

  test('AC-F-1: picking Extra large persists it and rebuilds the typography live', async () => {
    const { user } = await renderWithProviders(<TextSizeScreen />);

    await user.press(screen.getByRole('radio', { name: 'Extra large' }));

    expect(screen.getByRole('radio', { name: 'Extra large' })).toBeChecked();
    expect(saveFontScale).toHaveBeenLastCalledWith(1.3);
    expect(updateThemeSpy).toHaveBeenCalled();
    const [, updater] = updateThemeSpy.mock.calls[0] as [
      string,
      (current: object) => { typography: ReturnType<typeof buildTypography> },
    ];
    expect(updater({}).typography.body.fontSize).toBe(buildTypography(1.3).body.fontSize);
  });

  test('AC-F-4: shows a preview line in the body style', async () => {
    await renderWithProviders(<TextSizeScreen />);

    expect(screen.getByText('The quick brown fox jumps over the lazy dog.')).toBeOnTheScreen();
  });

  test('the stored size is the one selected when the screen opens', async () => {
    storedScale = '0.9';
    initTheme();

    await renderWithProviders(<TextSizeScreen />);

    expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked();
  });

  test('the back button goes back', async () => {
    const { user } = await renderWithProviders(<TextSizeScreen />);

    await user.press(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
