import { screen, waitFor } from '@testing-library/react-native';

import { ENV } from '@config/env';
import * as crashReporting from '@services/crash-reporting/crashReporting';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { CrashReportsRow } from './CrashReportsRow';

const getOptOut = jest.spyOn(crashReporting, 'getCrashReportsOptOut');
const setOptOut = jest.spyOn(crashReporting, 'setCrashReportsOptOut');
const isConfigured = jest.spyOn(crashReporting, 'isCrashReportingConfigured');

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(ENV, 'CRASH_REPORTING_ENABLED', true);
  isConfigured.mockReturnValue(true);
  getOptOut.mockReturnValue(false);
  setOptOut.mockResolvedValue(undefined);
});

const getSwitch = () => screen.getByRole('switch');

describe('CrashReportsRow', () => {
  test('is hidden when this environment does not report crashes', async () => {
    isConfigured.mockReturnValue(false);

    await renderWithProviders(<CrashReportsRow />);

    expect(screen.queryByText('Share crash reports')).not.toBeOnTheScreen();
  });

  test('is on until the user opts out', async () => {
    await renderWithProviders(<CrashReportsRow />);

    expect(screen.getByText('Share crash reports')).toBeOnTheScreen();
    expect(getSwitch()).toBeChecked();
  });

  test('shows off for a user who opted out earlier', async () => {
    getOptOut.mockReturnValue(true);

    await renderWithProviders(<CrashReportsRow />);

    expect(getSwitch()).not.toBeChecked();
  });

  test('turning it off opts out, turning it on opts back in', async () => {
    const { user } = await renderWithProviders(<CrashReportsRow />);

    await user.press(getSwitch());
    await waitFor(() => {
      expect(setOptOut).toHaveBeenLastCalledWith(true);
    });
    expect(getSwitch()).not.toBeChecked();

    await user.press(getSwitch());
    await waitFor(() => {
      expect(setOptOut).toHaveBeenLastCalledWith(false);
    });
    expect(getSwitch()).toBeChecked();
  });
});
