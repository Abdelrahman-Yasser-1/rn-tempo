import { screen, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { useAuthStore } from '@features/auth';
import { createUser } from '@test-utils/factories/user';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { SettingsScreen } from './SettingsScreen';

type SettingsProps = ComponentProps<typeof SettingsScreen>;

function makeNavigation() {
  return { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

async function renderSettings(navigation = makeNavigation()) {
  const props = {
    navigation,
    route: { key: 'Settings', name: 'Settings' },
  } as unknown as SettingsProps;
  return renderWithProviders(<SettingsScreen {...props} />);
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
    const navigation = makeNavigation();
    const { user } = await renderSettings(navigation);

    await user.press(screen.getByText('Language'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Language');

    await user.press(screen.getByText('Theme'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('Theme');

    await user.press(screen.getByText('About'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('About');
  });

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
