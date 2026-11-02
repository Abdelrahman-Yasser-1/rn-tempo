import { act } from '@testing-library/react-native';

import { useAuthStore } from '@features/auth';
import { createUser } from '@test-utils/factories/user';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useSettingsScreen } from './useSettingsScreen';

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

describe('useSettingsScreen', () => {
  let signOutSpy: jest.SpyInstance;

  beforeEach(() => {
    useAuthStore.setState({ status: 'signedIn', user: createUser() });
    signOutSpy = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue(undefined);
  });

  afterEach(() => {
    signOutSpy.mockRestore();
  });

  test('exposes the current language and theme preference, with the logout dialog closed', async () => {
    const { result } = await renderHookWithProviders(() => useSettingsScreen());

    expect(result.current.language).toBe('en');
    expect(result.current.preference).toBe('system');
    expect(result.current.isLogoutVisible).toBe(false);
  });

  test('the row handlers open Language, Theme and About', async () => {
    const { result } = await renderHookWithProviders(() => useSettingsScreen());

    result.current.onLanguage();
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('Language');

    result.current.onTheme();
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('Theme');

    result.current.onAbout();
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('About');
  });

  test('pressing log out opens the dialog and cancel closes it without signing out', async () => {
    const { result } = await renderHookWithProviders(() => useSettingsScreen());

    await act(() => {
      result.current.onLogoutPress();
      return Promise.resolve();
    });
    expect(result.current.isLogoutVisible).toBe(true);

    await act(() => {
      result.current.onLogoutCancel();
      return Promise.resolve();
    });
    expect(result.current.isLogoutVisible).toBe(false);
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  test('confirming log out closes the dialog and signs out', async () => {
    const { result } = await renderHookWithProviders(() => useSettingsScreen());
    await act(() => {
      result.current.onLogoutPress();
      return Promise.resolve();
    });

    await act(() => {
      result.current.onLogoutConfirm();
      return Promise.resolve();
    });

    expect(result.current.isLogoutVisible).toBe(false);
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });
});
