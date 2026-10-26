import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MessageButton, MessageScreen } from './MessageScreen';

describe('MessageScreen', () => {
  test('renders the title, message and a pressable action', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <MessageScreen message="Something happened" testID="demo-screen" title="Heads up">
        <MessageButton label="Do it" onPress={onPress} testID="demo.action" />
      </MessageScreen>,
    );

    expect(screen.getByRole('header', { name: 'Heads up' })).toBeOnTheScreen();
    expect(screen.getByText('Something happened')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Do it' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('renders no buttons without actions', async () => {
    await renderWithProviders(<MessageScreen message="m" testID="demo-screen" title="t" />);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
