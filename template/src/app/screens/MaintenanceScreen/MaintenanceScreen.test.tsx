import { screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { ENV } from '@config/env';
import { DEFAULT_APP_CONFIG } from '@services/remote-config/appConfig';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MaintenanceScreen } from './MaintenanceScreen';

describe('MaintenanceScreen', () => {
  test('shows the default message and calls onRetry', async () => {
    const onRetry = jest.fn();
    const { user } = await renderWithProviders(<MaintenanceScreen onRetry={onRetry} />);

    expect(screen.getByText(/undergoing maintenance/i)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('prefers the message from the remote config', async () => {
    server.use(
      http.get(`${ENV.API_BASE_URL}${ENV.APP_CONFIG_PATH}`, () =>
        HttpResponse.json({
          ...DEFAULT_APP_CONFIG,
          maintenance: { enabled: true, message: 'Back at noon' },
        }),
      ),
    );

    await renderWithProviders(<MaintenanceScreen onRetry={jest.fn()} />);

    expect(await screen.findByText('Back at noon')).toBeOnTheScreen();
  });

  test('the default retry refetches the config without crashing', async () => {
    const { user } = await renderWithProviders(<MaintenanceScreen />);

    await user.press(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByRole('header', { name: "We'll be right back" })).toBeOnTheScreen();
  });
});
