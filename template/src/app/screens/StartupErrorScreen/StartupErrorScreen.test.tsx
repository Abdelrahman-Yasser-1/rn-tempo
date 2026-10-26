import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { StartupErrorScreen } from './StartupErrorScreen';

describe('StartupErrorScreen', () => {
  test('offers a retry', async () => {
    const onRetry = jest.fn();
    const { user } = await renderWithProviders(<StartupErrorScreen onRetry={onRetry} />);

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
