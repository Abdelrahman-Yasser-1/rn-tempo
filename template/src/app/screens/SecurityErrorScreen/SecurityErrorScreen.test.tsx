import { screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { SecurityErrorScreen } from './SecurityErrorScreen';

describe('SecurityErrorScreen', () => {
  test('lists the reasons and offers only Close on Android, which exits the app', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const exitApp = jest.spyOn(BackHandler, 'exitApp').mockImplementation(jest.fn());
    const { user } = await renderWithProviders(
      <SecurityErrorScreen reasons={['jailbroken', 'ssl']} />,
    );

    expect(screen.getByText(/rooted or jailbroken/i)).toBeOnTheScreen();
    expect(screen.getByText(/could not be verified/i)).toBeOnTheScreen();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  test('iOS shows the message without any button', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    await renderWithProviders(<SecurityErrorScreen />);

    expect(screen.getByRole('header', { name: 'Security issue detected' })).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
