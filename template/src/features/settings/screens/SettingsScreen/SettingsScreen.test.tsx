import { screen, waitFor } from '@testing-library/react-native';

import { ENV } from '@config/env'; // @tempo-feature:push-notifications
import { useAuthStore } from '@features/auth';
import { createUser } from '@test-utils/factories/user';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { SettingsScreen } from './SettingsScreen';

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

async function renderSettings() {
  return renderWithProviders(<SettingsScreen />);
}

beforeEach(() => {
  useAuthStore.setState({ status: 'signedIn', user: createUser(), pendingLink: null });
});

describe('SettingsScreen', () => {
  test('AC-1: shows the Language, Theme, About and Log out rows', async () => {
    await renderSettings();

    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.getByText('Theme')).toBeOnTheScreen();
    expect(screen.getByText('About')).toBeOnTheScreen();
    expect(screen.getByText('Log out')).toBeOnTheScreen();
  });

  test('AC-1: the Language, Theme and About rows open their screens', async () => {
    const { user } = await renderSettings();

    await user.press(screen.getByText('Language'));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('Language');

    await user.press(screen.getByText('Theme'));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('Theme');

    await user.press(screen.getByText('About'));
    expect(mockNavigation.navigate).toHaveBeenLastCalledWith('About');
  });

  // @tempo-feature:push-notifications:start
  test('shows the Notifications row between Theme and About when push is on', async () => {
    jest.replaceProperty(ENV, 'FIREBASE_ENABLED', true);
    jest.replaceProperty(ENV, 'PUSH_ENABLED', true);
    await renderSettings();

    expect(await screen.findByText('Notifications')).toBeOnTheScreen();
  });

  test('hides the Notifications row when push is off for the environment', async () => {
    jest.replaceProperty(ENV, 'PUSH_ENABLED', false);
    await renderSettings();

    expect(await screen.findByText('About')).toBeOnTheScreen();
    expect(screen.queryByText('Notifications')).not.toBeOnTheScreen();
  });
  // @tempo-feature:push-notifications:end

  test('AC-5: cancelling the log-out dialog keeps the user signed in', async () => {
    const { user } = await renderSettings();

    await user.press(screen.getByText('Log out'));
    expect(await screen.findByText('Log out?')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  test('AC-5: confirming the log-out dialog signs the user out', async () => {
    const { user } = await renderSettings();

    await user.press(screen.getByText('Log out'));
    expect(await screen.findByText('You will need to sign in again.')).toBeOnTheScreen();

    // The row and the dialog both read "Log out"; the dialog is rendered last.
    const dialogConfirm = screen.getAllByRole('button', { name: 'Log out' }).at(-1);
    if (!dialogConfirm) {
      throw new Error('The log-out confirm button is not on screen');
    }
    await user.press(dialogConfirm);

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signedOut');
    });
    expect(useAuthStore.getState().user).toBeNull();
  });
});
