import { useNavigation } from '@react-navigation/native';
import { screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { DebugMenuScreen } from '@app/screens/DebugMenuScreen/DebugMenuScreen';
import { API_SOURCE_KEY, BACKEND_URL_KEY } from '@services/http/apiSource';
import { initStorage, storage } from '@services/storage/storage';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ApiSourceControls } from './ApiSourceControls';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: jest.fn(),
}));

beforeEach(async () => {
  await initStorage();
  storage.clearAll();
  jest.mocked(useNavigation).mockReturnValue({ navigate: jest.fn() });
});

describe('DebugMenuScreen API source', () => {
  test('offers the two sources, with the build default selected', async () => {
    await renderWithProviders(<DebugMenuScreen />);

    expect(screen.getByRole('header', { name: 'API source' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Build default (env file)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tempo backend' })).not.toBeChecked();
    expect(screen.queryByLabelText('Tempo backend URL')).not.toBeOnTheScreen();
  });

  test('the hint names the team server form of the URL', async () => {
    await renderWithProviders(<DebugMenuScreen />);

    expect(screen.getByText(/https:\/\/<host>\/b\/<name>/)).toBeOnTheScreen();
  });

  test('choosing a source stores it, and choosing the build default removes it', async () => {
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await user.press(screen.getByRole('radio', { name: 'Tempo backend' }));
    expect(storage.getString(API_SOURCE_KEY)).toBe('backend');
    expect(screen.getByRole('radio', { name: 'Tempo backend' })).toBeChecked();
    expect(screen.getByText('Saved. Restart the app to apply.')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Build default (env file)' }));
    expect(storage.getString(API_SOURCE_KEY)).toBeUndefined();
  });

  test('shows the stored source on open', async () => {
    storage.setString(API_SOURCE_KEY, 'backend');

    await renderWithProviders(<DebugMenuScreen />);

    expect(screen.getByRole('radio', { name: 'Tempo backend' })).toBeChecked();
    expect(screen.getByLabelText('Tempo backend URL')).toBeOnTheScreen();
  });

  test('Tempo backend shows the platform URL, saves an edited one and resets it', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await user.press(screen.getByRole('radio', { name: 'Tempo backend' }));
    expect(storage.getString(API_SOURCE_KEY)).toBe('backend');
    expect(screen.getByLabelText('Tempo backend URL')).toHaveDisplayValue('https://localhost:8443');

    await user.clear(screen.getByLabelText('Tempo backend URL'));
    await user.type(screen.getByLabelText('Tempo backend URL'), ' https://192.168.1.20:8443 ');
    await user.press(screen.getByRole('button', { name: 'Save URL' }));
    expect(storage.getString(BACKEND_URL_KEY)).toBe('https://192.168.1.20:8443');
    expect(screen.getByLabelText('Tempo backend URL')).toHaveDisplayValue(
      'https://192.168.1.20:8443',
    );

    await user.press(screen.getByRole('button', { name: 'Use default' }));
    expect(storage.getString(BACKEND_URL_KEY)).toBeUndefined();
    expect(screen.getByLabelText('Tempo backend URL')).toHaveDisplayValue('https://localhost:8443');
  });

  test('on Android the default URL is the emulator host alias', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    storage.setString(API_SOURCE_KEY, 'backend');

    await renderWithProviders(<ApiSourceControls />);

    expect(screen.getByLabelText('Tempo backend URL')).toHaveDisplayValue('https://10.0.2.2:8443');
  });

  test('renders in Arabic', async () => {
    await renderWithProviders(<DebugMenuScreen />, { language: 'ar' });

    expect(screen.getByRole('radio', { name: 'خادم Tempo الخلفي' })).toBeOnTheScreen();
  });
});
