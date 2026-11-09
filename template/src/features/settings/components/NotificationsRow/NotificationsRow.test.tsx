/* eslint-disable @typescript-eslint/no-deprecated, sonarjs/deprecation -- the tests drive the mocked RNFB token and permission functions that RNFB 27 deprecates; see fcm.ts */
import { getApps, type FirebaseApp } from '@react-native-firebase/app';
import { getToken, hasPermission, requestPermission } from '@react-native-firebase/messaging';
import { screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ENV } from '@config/env';
import * as linking from '@services/linking/linking';
import { logger } from '@services/logger/logger';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { NotificationsRow } from './NotificationsRow';

const APP = { name: '[DEFAULT]' } as FirebaseApp;

const AUTHORIZED = 1;
const DENIED = 0;
const NOT_DETERMINED = -1;

jest.spyOn(logger, 'debug').mockImplementation(jest.fn());
const openSettings = jest.spyOn(linking, 'openSettings').mockResolvedValue(true);

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
  jest.mocked(getApps).mockReturnValue([APP]);
  jest.replaceProperty(ENV, 'FIREBASE_ENABLED', true);
  jest.replaceProperty(ENV, 'PUSH_ENABLED', true);
  jest.mocked(getToken).mockResolvedValue('fcm-token');
  jest.mocked(hasPermission).mockResolvedValue(NOT_DETERMINED);
});

const getSwitch = () => screen.getByRole('switch');

describe('NotificationsRow', () => {
  test('is hidden when push is off for the environment', async () => {
    jest.replaceProperty(ENV, 'PUSH_ENABLED', false);

    await renderWithProviders(<NotificationsRow />);

    expect(screen.queryByText('Notifications')).not.toBeOnTheScreen();
  });

  test('shows the row off before the user was asked', async () => {
    await renderWithProviders(<NotificationsRow />);

    expect(screen.getByText('Notifications')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByText('Off')).toBeOnTheScreen();
    });
    expect(getSwitch()).not.toBeChecked();
  });

  test('turning it on asks for the permission and shows it on after a yes', async () => {
    jest.mocked(requestPermission).mockResolvedValue(AUTHORIZED);
    const { user } = await renderWithProviders(<NotificationsRow />);

    await user.press(getSwitch());

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('On')).toBeOnTheScreen();
    expect(getSwitch()).toBeChecked();
    expect(openSettings).not.toHaveBeenCalled();
  });

  test('a no in the prompt leaves it off and does not open the settings', async () => {
    jest.mocked(requestPermission).mockResolvedValue(DENIED);
    const { user } = await renderWithProviders(<NotificationsRow />);

    await user.press(getSwitch());

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
    expect(openSettings).not.toHaveBeenCalled();
  });

  test('when the system blocks the prompt the row says so and opens the settings', async () => {
    jest.mocked(hasPermission).mockResolvedValue(DENIED);
    const { user } = await renderWithProviders(<NotificationsRow />);
    expect(await screen.findByText('Turned off in the system settings')).toBeOnTheScreen();

    await user.press(getSwitch());

    await waitFor(() => {
      expect(openSettings).toHaveBeenCalledTimes(1);
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test('turning it off opens the system settings', async () => {
    jest.mocked(hasPermission).mockResolvedValue(AUTHORIZED);
    const { user } = await renderWithProviders(<NotificationsRow />);
    expect(await screen.findByText('On')).toBeOnTheScreen();

    await user.press(getSwitch());

    await waitFor(() => {
      expect(openSettings).toHaveBeenCalledTimes(1);
    });
  });
});
