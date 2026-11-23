import { screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { appIconService, type AppIconName } from '@services/app-icon';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { AppIconScreen } from './AppIconScreen';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

it('AC-I-1: shows four preview radios, switches icons and restores Default', async () => {
  let stored: AppIconName = 'forest';
  jest.spyOn(appIconService, 'getIcon').mockImplementation(() => Promise.resolve(stored));
  const write = jest.spyOn(appIconService, 'setIcon').mockImplementation((name) => {
    stored = name;
    return Promise.resolve();
  });
  const { user } = await renderWithProviders(<AppIconScreen />);
  await waitFor(() => {
    expect(screen.getByRole('radio', { name: 'Forest' })).toBeChecked();
  });
  for (const name of ['Default', 'Ocean', 'Forest', 'Sunset']) {
    expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
    expect(
      // eslint-disable-next-line rn-tempo/discouraged-syntax -- decorative previews have no accessible role or label.
      screen.getByTestId(`app-icon.preview-${name.toLowerCase()}`, { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  }
  for (const name of ['Ocean', 'Default']) {
    await user.press(screen.getByRole('radio', { name }));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name })).toBeChecked();
    });
    expect(write).toHaveBeenLastCalledWith(name.toLowerCase());
  }
  await user.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('AC-I-4: explains lack of support and hides all choices', async () => {
  jest.spyOn(appIconService, 'isSupported').mockReturnValue(false);
  const read = jest.spyOn(appIconService, 'getIcon');
  await renderWithProviders(<AppIconScreen />);
  expect(screen.getByText('This device doesn’t support changing the app icon.')).toBeOnTheScreen();
  expect(screen.queryByRole('radio')).toBeNull();
  expect(read).not.toHaveBeenCalled();
});

it.each(['android', 'ios'] as const)(
  'AC-I-5: shows the launcher note only on Android (%s)',
  async (os) => {
    jest.replaceProperty(Platform, 'OS', os);
    await renderWithProviders(<AppIconScreen />);
    const note = screen.queryByText(
      'The icon may take a few seconds to update. Home screen shortcuts may be removed.',
    );
    expect(note !== null).toBe(os === 'android');
  },
);
