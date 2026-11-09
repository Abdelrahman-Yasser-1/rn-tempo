import { useNavigation } from '@react-navigation/native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@features/auth';
import * as crashReporting from '@services/crash-reporting/crashReporting';
import { getFlagOverride } from '@services/flags/flagOverrides';
import { queryClient } from '@services/http/queryClient';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { DebugMenuScreen } from './DebugMenuScreen';

beforeEach(async () => {
  await initStorage();
  storage.clearAll();
  jest.mocked(useNavigation).mockReturnValue({ navigate: jest.fn() });
});

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: jest.fn(),
}));

describe('DebugMenuScreen crash reporting', () => {
  const isConfigured = jest.spyOn(crashReporting, 'isCrashReportingConfigured');
  const record = jest.spyOn(crashReporting, 'recordError').mockImplementation(jest.fn());

  test('has no test error button when this environment does not report crashes', async () => {
    isConfigured.mockReturnValue(false);

    await renderWithProviders(<DebugMenuScreen />);

    expect(screen.queryByText('Send test error')).not.toBeOnTheScreen();
  });

  test('sends a test error when this environment reports crashes', async () => {
    isConfigured.mockReturnValue(true);
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await user.press(screen.getByRole('button', { name: 'Send test error' }));

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error from the debug menu' }),
      {
        source: 'debug-menu',
      },
    );
  });
});

describe('DebugMenuScreen', () => {
  test('shows environment info', async () => {
    await renderWithProviders(<DebugMenuScreen />);

    expect(screen.getByText('dev')).toBeOnTheScreen();
    expect(screen.getByText('com.rntempo.app.dev')).toBeOnTheScreen();
    expect(screen.getByText('0.0.1')).toBeOnTheScreen();
  });

  test('saves and clears the API base URL override', async () => {
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await user.type(screen.getByLabelText('API base URL override'), 'https://staging.example.test');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(storage.getString(STORAGE_KEYS.apiBaseUrlOverride)).toBe('https://staging.example.test');
    expect(screen.getByText('Done')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Clear' }));
    expect(storage.getString(STORAGE_KEYS.apiBaseUrlOverride)).toBeUndefined();
  });

  test('saving an empty value removes the override', async () => {
    storage.setString(STORAGE_KEYS.apiBaseUrlOverride, 'https://old.example.test');
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await user.clear(screen.getByLabelText('API base URL override'));
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(storage.getString(STORAGE_KEYS.apiBaseUrlOverride)).toBeUndefined();
  });

  test('toggling a flag stores a local override, and reset removes it', async () => {
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await fireEvent(
      screen.getByRole('switch', { name: 'biometricLoginEnabled' }),
      'valueChange',
      true,
    );
    expect(getFlagOverride('biometricLoginEnabled')).toBe(true);

    await user.press(screen.getByRole('button', { name: 'Reset overrides' }));
    expect(getFlagOverride('biometricLoginEnabled')).toBeUndefined();
  });

  test('clear storage, query cache and tokens', async () => {
    storage.setString('x', 'y');
    queryClient.setQueryData(['k'], 1);
    await useAuthStore.getState().signIn(
      { accessToken: 'a', refreshToken: 'r' },
      {
        id: 1,
        username: 'u',
        email: 'e',
        firstName: 'f',
        lastName: 'l',
        gender: 'g',
        image: 'i',
      },
    );
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await user.press(screen.getByRole('button', { name: 'Clear storage' }));
    expect(storage.getString('x')).toBeUndefined();

    await user.press(screen.getByRole('button', { name: 'Clear query cache' }));
    expect(queryClient.getQueryData(['k'])).toBeUndefined();

    await user.press(screen.getByRole('button', { name: 'Clear tokens (sign out)' }));
    await waitFor(() => {
      expect(tokenStore.hasTokens()).toBe(false);
    });
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  test('renders in Arabic', async () => {
    await renderWithProviders(<DebugMenuScreen />, { language: 'ar' });

    expect(screen.getByRole('button', { name: 'مسح التخزين' })).toBeOnTheScreen();
  });

  test('opens the network log', async () => {
    const navigate = jest.fn();
    jest.mocked(useNavigation).mockReturnValue({ navigate });
    const { user } = await renderWithProviders(<DebugMenuScreen />);

    await user.press(screen.getByRole('button', { name: 'Open network log' }));

    expect(navigate).toHaveBeenCalledWith('NetworkLog');
  });
});
