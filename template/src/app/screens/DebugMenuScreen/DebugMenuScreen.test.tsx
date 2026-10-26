import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@features/auth';
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

    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 made fireEvent async
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
});
