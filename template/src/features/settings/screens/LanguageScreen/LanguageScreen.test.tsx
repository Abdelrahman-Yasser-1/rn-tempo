import { screen, waitFor } from '@testing-library/react-native';

import * as languageManager from '@services/i18n/languageManager';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { LanguageScreen } from './LanguageScreen';

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

async function renderLanguage() {
  return renderWithProviders(<LanguageScreen />, { language: 'en' });
}

const ARABIC = 'العربية';

describe('LanguageScreen', () => {
  let changeLanguageSpy: jest.SpyInstance;

  beforeEach(() => {
    // changeLanguage persists the choice and may restart the app, so it is replaced by a stub.
    changeLanguageSpy = jest.spyOn(languageManager, 'changeLanguage').mockResolvedValue(false);
  });

  afterEach(() => {
    changeLanguageSpy.mockRestore();
  });

  test('AC-L-1: lists all five languages in their own names with the current one selected', async () => {
    await renderLanguage();

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    for (const name of ['English', ARABIC, 'Español', 'Deutsch', 'Français']) {
      expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    for (const name of [ARABIC, 'Español', 'Deutsch', 'Français']) {
      expect(screen.getByRole('radio', { name })).not.toBeChecked();
    }
  });

  test.each(['Español', 'Deutsch', 'Français'])(
    'AC-L-1: picking %s from English applies it at once, without a dialog',
    async (name) => {
      const { user } = await renderLanguage();

      await user.press(screen.getByRole('radio', { name }));

      await waitFor(() => {
        expect(changeLanguageSpy).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText('Change language?')).not.toBeOnTheScreen();
    },
  );

  test('AC-2: picking a different language asks for confirmation and does not apply it yet', async () => {
    const { user } = await renderLanguage();

    await user.press(screen.getByRole('radio', { name: ARABIC }));

    expect(await screen.findByText('Change language?')).toBeOnTheScreen();
    expect(
      screen.getByText('The app may restart to apply the new language and layout direction.'),
    ).toBeOnTheScreen();
    expect(changeLanguageSpy).not.toHaveBeenCalled();
  });

  test('AC-2: confirming the dialog applies the picked language', async () => {
    const { user } = await renderLanguage();

    await user.press(screen.getByRole('radio', { name: ARABIC }));
    await screen.findByText('Change language?');
    await user.press(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(changeLanguageSpy).toHaveBeenCalledWith('ar');
    });
    expect(changeLanguageSpy).toHaveBeenCalledTimes(1);
  });

  test('AC-2: cancelling the dialog leaves the language unchanged', async () => {
    const { user } = await renderLanguage();

    await user.press(screen.getByRole('radio', { name: ARABIC }));
    await screen.findByText('Change language?');
    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Change language?')).not.toBeOnTheScreen();
    expect(changeLanguageSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  });

  test('AC-2: re-picking the current language opens no dialog', async () => {
    const { user } = await renderLanguage();

    await user.press(screen.getByRole('radio', { name: 'English' }));

    expect(screen.queryByText('Change language?')).not.toBeOnTheScreen();
    expect(changeLanguageSpy).not.toHaveBeenCalled();
  });
});
